import React, { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import api from "../../api";
import { Card, Badge, Spinner, Select } from "../../components/ui";

function BarList({ items, colorFor = () => "bg-primary" }) {
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <span className="text-xs text-ink2 w-36 shrink-0 truncate">{it.label}</span>
          <div className="flex-1 h-5 bg-line/50 rounded-md overflow-hidden">
            <div className={`h-full rounded-md ${colorFor(it.label)}`} style={{ width: `${it.pct}%` }} />
          </div>
          <span className="font-mono text-xs w-20 text-right shrink-0">{it.count} · {it.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ChapterIntelligence() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ subject: "", klass: "", board: "" });
  const [chapters, setChapters] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => setMeta({ subjects: [], classes: [], boards: [] })); }, []);

  useEffect(() => {
    setChapters(null);
    const params = {};
    if (filters.subject) params.subject = filters.subject;
    if (filters.klass) params.klass = filters.klass;
    if (filters.board) params.board = filters.board;
    api.get("/insights/chapters", { params }).then(({ data }) => {
      setChapters(data);
      setSelected(data[0] || null);
    }).catch(() => setChapters([]));
  }, [filters]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setDetail(null);
    api.get("/insights/chapters/stats", { params: { board: selected.board, klass: selected.class, subject: selected.subject, chapter: selected.chapter } })
      .then(({ data }) => setDetail(data)).catch(() => setDetail(false));
  }, [selected]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const isSameChapter = (c) => selected && c.chapter === selected.chapter && c.subject === selected.subject;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-chapter-intelligence-page">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Chapter Intelligence</h1>
          <p className="text-ink2">Browse the chapter bank and inspect each chapter's question-type mix and difficulty.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Select label="Subject" testid="ci-filter-subject" value={filters.subject} onChange={set("subject")}>
          <option value="">All subjects</option>
          {(meta?.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select label="Class" testid="ci-filter-class" value={filters.klass} onChange={set("klass")}>
          <option value="">All classes</option>
          {(meta?.classes || []).map((c) => <option key={c} value={c}>Class {c}</option>)}
        </Select>
        <Select label="Board" testid="ci-filter-board" value={filters.board} onChange={set("board")}>
          <option value="">All boards</option>
          {(meta?.boards || []).map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-5">
        <Card className="p-2 max-h-[640px] overflow-y-auto" data-testid="ci-chapter-list">
          {!chapters ? (
            <div className="p-8 grid place-items-center"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-ink2 p-4" data-testid="ci-empty">No chapters match these filters.</p>
          ) : chapters.map((c) => (
            <button key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`}
              onClick={() => setSelected(c)}
              data-testid={`ci-chapter-item-${c.chapter}`.replace(/\s+/g, "-")}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${isSameChapter(c) ? "bg-primary/10" : "hover:bg-line/50"}`}>
              <div className="min-w-0">
                <div className={`text-sm font-medium truncate ${isSameChapter(c) ? "text-primary" : "text-ink"}`}>{c.chapter}</div>
                <div className="text-xs text-ink2">{c.subject} · {c.board} · Class {c.class}</div>
              </div>
              <div className="text-xs text-ink2 font-mono shrink-0">{c.questionCount} Q · {c.totalMarksCoverage}m</div>
            </button>
          ))}
        </Card>

        <Card className="p-6 min-h-[420px]">
          {!selected ? (
            <p className="text-ink2">Select a chapter to see its stats.</p>
          ) : !detail ? (
            <div className="p-8 grid place-items-center"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : (
            <div data-testid="ci-detail">
              <h2 className="font-heading font-bold text-xl mb-2">{detail.chapter.chapter}</h2>
              <div className="flex gap-1.5 mb-5">
                <Badge tone="neutral">{detail.chapter.subject}</Badge>
                <Badge tone="neutral">{detail.chapter.board}</Badge>
                <Badge tone="neutral">Class {detail.chapter.class}</Badge>
              </div>
              <div className="flex gap-8 mb-6">
                <div><div className="text-xs uppercase tracking-wide text-ink2">Questions</div><div className="font-mono font-bold text-2xl">{detail.questionCount}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-ink2">Marks coverage</div><div className="font-mono font-bold text-2xl">{detail.totalMarks}</div></div>
              </div>
              <h3 className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Question type distribution</h3>
              <div className="mb-6">
                <BarList items={detail.typeDistribution.map((t) => ({ label: t.key, count: t.count, pct: t.pct }))} />
              </div>
              <h3 className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Difficulty mix</h3>
              <BarList items={detail.difficultyDistribution.map((d) => ({ label: d.key, count: d.count, pct: d.pct }))}
                colorFor={(l) => (l === "Easy" ? "bg-success" : l === "Hard" ? "bg-danger" : "bg-accent")} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
