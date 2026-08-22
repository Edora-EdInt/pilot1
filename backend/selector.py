"""QuestionSelector (Python) — v2 rewrite.

Fixes over v1:
  * Honors all 6 question types (MCQ, Very Short Answer, Short Answer,
    Long Answer, Case Study, Assertion Reason) instead of collapsing to 3.
  * Deterministic-but-seeded randomization: every generation shuffles the
    candidate pool with a seed, so the same blueprint no longer yields the
    identical paper (and a seed can reproduce one on demand).
  * Robust remainder handling via largest-fit packing per (type, difficulty)
    bucket with a proportional-remainder redistribution pass.
  * Multi-variant diversity: variants exclude questions used by earlier
    variants first, then fall back; overlap similarity is reported.
"""
import random

TYPE_MAP = {
    "mcq": "MCQ",
    "veryShort": "Very Short Answer",
    "short": "Short Answer",
    "long": "Long Answer",
    "caseStudy": "Case Study",
    "assertion": "Assertion Reason",
}
DIFF_MAP = {"easy": "Easy", "medium": "Medium", "hard": "Hard"}
OBJECTIVE_TYPES = {"MCQ", "Assertion Reason"}
TYPE_ORDER = ["MCQ", "Assertion Reason", "Very Short Answer",
              "Short Answer", "Case Study", "Long Answer"]


class QuestionSelector:
    def __init__(self, questions):
        self.bank = questions

    # ── public ──
    def select_variants(self, blueprint, count=1, base_seed=None):
        pool = self._filter_pool(blueprint)
        base_seed = base_seed if base_seed is not None else random.randint(1, 10_000_000)
        used_global = set()
        papers = []
        labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for i in range(count):
            rng = random.Random(base_seed + i * 7919)
            paper = self._select_one(blueprint, pool, used_global, rng)
            paper["label"] = labels[i] if i < len(labels) else str(i + 1)
            paper["seed"] = base_seed + i * 7919
            for q in paper["questions"]:
                used_global.add(q["id"])
            papers.append(paper)

        similarity = self._similarity(papers)
        diversity_warn = any(s["overlap"] > 30 for s in similarity)
        for p in papers:
            p["similarity"] = similarity
            if count > 1 and diversity_warn:
                p.setdefault("warnings", []).append(
                    "Question bank lacks enough alternatives for fully distinct "
                    "variants; closest available questions were reused.")
            if p["totalMarksSelected"] < blueprint["config"]["totalMarks"]:
                p.setdefault("warnings", []).append(
                    "This variant could not fully meet the target marks due to "
                    "insufficient eligible questions.")
        return papers

    # ── internals ──
    def _filter_pool(self, bp):
        c = bp.get("curriculum", {})
        board = c.get("board")
        grade = c.get("grade")
        subject = c.get("subject")
        chapters = c.get("chapters") or []
        out = []
        for q in self.bank:
            if board and q.get("board") != board:
                continue
            if grade is not None and int(q.get("class", -1)) != int(grade):
                continue
            if subject and q.get("subject") != subject:
                continue
            if chapters and q.get("chapter") not in chapters:
                continue
            out.append(q)
        return out

    def _type_targets(self, qt, total_marks):
        targets = {}
        for key, pct in qt.items():
            if pct <= 0 or key not in TYPE_MAP:
                continue
            name = TYPE_MAP[key]
            targets[name] = targets.get(name, 0) + round(total_marks * pct / 100)
        # redistribute rounding remainder to the largest bucket
        allocated = sum(targets.values())
        if targets and allocated != total_marks:
            big = max(targets, key=targets.get)
            targets[big] += (total_marks - allocated)
            if targets[big] < 0:
                targets[big] = 0
        return targets

    def _diff_targets(self, diff, marks_needed):
        buckets = {}
        for key, pct in diff.items():
            if pct <= 0 or key not in DIFF_MAP:
                continue
            buckets[DIFF_MAP[key]] = round(marks_needed * pct / 100)
        allocated = sum(buckets.values())
        if buckets and allocated != marks_needed:
            big = max(buckets, key=buckets.get)
            buckets[big] += (marks_needed - allocated)
            if buckets[big] < 0:
                buckets[big] = 0
        return buckets

    def _fill(self, candidates, target, rng, taken):
        """Largest-fit packing with randomized tie-breaking."""
        pool = [q for q in candidates if q["id"] not in taken]
        rng.shuffle(pool)  # randomize, then stable-sort keeps random order within equal marks
        pool.sort(key=lambda q: -int(q.get("marks", 1)))
        selected = []
        remaining = target
        for q in pool:
            m = int(q.get("marks", 1))
            if m <= remaining:
                selected.append(q)
                taken.add(q["id"])
                remaining -= m
                if remaining <= 0:
                    break
        return selected, remaining

    def _select_one(self, bp, pool, exclude_global, rng):
        total_marks = bp["config"]["totalMarks"]
        type_targets = self._type_targets(bp.get("questionTypes", {}), total_marks)
        selected = []
        taken = set()  # ids used in THIS paper
        for tname, tmarks in type_targets.items():
            if tmarks <= 0:
                continue
            tqs = [q for q in pool if q.get("questionType") == tname]
            for dname, dmarks in self._diff_targets(bp.get("difficulty", {}), tmarks).items():
                if dmarks <= 0:
                    continue
                cands = [q for q in tqs if q.get("difficulty") == dname]
                # pass 1: prefer questions not used by earlier variants
                block = exclude_global | taken
                picked, rem = self._fill(cands, dmarks, rng, block)
                selected.extend(picked)
                for q in picked:
                    taken.add(q["id"])
                # pass 2 (fallback): allow earlier-variant reuse, not own paper
                if rem > 0:
                    picked2, _ = self._fill(cands, rem, rng, taken)
                    selected.extend(picked2)
                    for q in picked2:
                        taken.add(q["id"])

        # top-up pass: fill toward target marks using any remaining eligible
        # questions (structured distribution is a preference, not a hard cap).
        total_sel = sum(int(q.get("marks", 1)) for q in selected)
        if total_sel < total_marks:
            remaining = total_marks - total_sel
            for block in (exclude_global | taken, taken):  # prefer unused-by-variants first
                extra = [q for q in pool if q["id"] not in block]
                rng.shuffle(extra)
                extra.sort(key=lambda q: -int(q.get("marks", 1)))
                for q in extra:
                    m = int(q.get("marks", 1))
                    if m <= remaining:
                        selected.append(q)
                        taken.add(q["id"])
                        remaining -= m
                        if remaining <= 0:
                            break
                if remaining <= 0:
                    break

        selected = self._order(selected)
        total_sel = sum(int(q.get("marks", 1)) for q in selected)
        return {
            "questions": selected,
            "sections": self._sections(selected),
            "totalMarksSelected": total_sel,
            "totalQuestionsSelected": len(selected),
            "compliance": self._compliance(selected, bp, pool),
            "warnings": [],
        }

    def _order(self, qs):
        idx = {t: i for i, t in enumerate(TYPE_ORDER)}
        return sorted(qs, key=lambda q: (idx.get(q.get("questionType"), 99), int(q.get("marks", 1))))

    def _sections(self, qs):
        sec = {}
        for q in qs:
            sec.setdefault(q.get("questionType", "Other"), []).append(q)
        return sec

    def _distribution(self, qs, key):
        counts, total = {}, 0
        for q in qs:
            v = q.get(key)
            m = int(q.get("marks", 1))
            counts[v] = counts.get(v, 0) + m
            total += m
        return {k: round(v / total * 100) if total else 0 for k, v in counts.items()}

    def _compliance(self, selected, bp, pool):
        total_marks = bp["config"]["totalMarks"]
        sel_marks = sum(int(q.get("marks", 1)) for q in selected)
        marks_match = round(min(sel_marks / total_marks, 1) * 100) if total_marks else 0
        actual_diff = self._distribution(selected, "difficulty")
        actual_type = self._distribution(selected, "questionType")

        diff_target = {DIFF_MAP[k]: v for k, v in bp.get("difficulty", {}).items() if k in DIFF_MAP}
        type_target = {}
        for k, v in bp.get("questionTypes", {}).items():
            if k in TYPE_MAP:
                type_target[TYPE_MAP[k]] = type_target.get(TYPE_MAP[k], 0) + v

        return {
            "marksMatch": marks_match,
            "difficultyMatch": self._match(diff_target, actual_diff),
            "typeMatch": self._match(type_target, actual_type),
            "selectedMarks": sel_marks,
            "targetMarks": total_marks,
            "actualDifficulty": actual_diff,
            "actualTypes": actual_type,
            "poolSize": len(pool),
        }

    def _match(self, target, actual):
        keys = set(target) | set(actual)
        if not keys:
            return 100
        diff = sum(abs(target.get(k, 0) - actual.get(k, 0)) for k in keys) / len(keys)
        return max(0, min(100, round(100 - diff)))

    def _similarity(self, papers):
        res = []
        for i in range(len(papers)):
            for j in range(i + 1, len(papers)):
                a = {q["id"] for q in papers[i]["questions"]}
                b = {q["id"] for q in papers[j]["questions"]}
                total = max(len(a), len(b)) or 1
                overlap = round(len(a & b) / total * 100)
                res.append({"pair": f'{papers[i]["label"]} vs {papers[j]["label"]}', "overlap": overlap})
        return res
