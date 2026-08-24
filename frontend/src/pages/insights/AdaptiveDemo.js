import React, { useState, useEffect } from "react";
import { SlidersHorizontal, Check, X, RotateCcw } from "lucide-react";
import api from "../../api";
import { Card, Select, Button } from "../../components/ui";

const LEVELS = ["Easy", "Medium", "Hard"];
const STEPS_UP = 2;
const STEPS_DOWN = 1;

function useAdaptiveEngine() {
  const [levelIndex, setLevelIndex] = useState(1);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [incorrectStreak, setIncorrectStreak] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [log, setLog] = useState([]);

  const answer = (isCorrect) => {
    const previousLevel = LEVELS[levelIndex];
    let nextIndex = levelIndex;
    let changed = false;
    if (isCorrect) {
      const streak = correctStreak + 1;
      setTotalCorrect((t) => t + 1);
      if (levelIndex < LEVELS.length - 1 && streak >= STEPS_UP) { nextIndex = levelIndex + 1; changed = true; setCorrectStreak(0); }
      else setCorrectStreak(streak);
      setIncorrectStreak(0);
    } else {
      const streak = incorrectStreak + 1;
      if (levelIndex > 0 && streak >= STEPS_DOWN) { nextIndex = levelIndex - 1; changed = true; setIncorrectStreak(0); }
      else setIncorrectStreak(streak);
      setCorrectStreak(0);
    }
    setLevelIndex(nextIndex);
    setTotalAnswered((t) => t + 1);
    setLog((l) => [{ n: l.length + 1, answer: isCorrect ? "correct" : "incorrect", previousLevel, level: LEVELS[nextIndex], changed }, ...l]);
  };

  const reset = () => { setLevelIndex(1); setCorrectStreak(0); setIncorrectStreak(0); setTotalAnswered(0); setTotalCorrect(0); setLog([]); };

  return { level: LEVELS[levelIndex], levelIndex, correctStreak, totalAnswered, totalCorrect, log, answer, reset };
}

export default function AdaptiveDemo() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ board: "CBSE", klass: "", subject: "", chapter: "" });
  const [chapters, setChapters] = useState([]);
  const [levels, setLevels] = useState(null);
  const [cursor, setCursor] = useState({ Easy: 0, Medium: 0, Hard: 0 });
  const engine = useAdaptiveEngine();

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!filters.subject) { setChapters([]); return; }
    api.get("/insights/chapters", { params: { subject: filters.subject, klass: filters.klass, board: filters.board } })
      .then(({ data }) => setChapters(data)).catch(() => setChapters([]));
  }, [filters.subject, filters.klass, filters.board]);

  const load = async () => {
    setLevels(null);
    try {
      const { data } = await api.get("/insights/adaptive/questions", { params: filters });
      setLevels(data.levels);
      setCursor({ Easy: 0, Medium: 0, Hard: 0 });
      engine.reset();
    } catch { setLevels(false); }
  };

  const current = levels && levels[engine.level]?.length ? levels[engine.level][cursor[engine.level] % levels[engine.level].length] : null;

  const answer = (isCorrect) => {
    engine.answer(isCorrect);
    setCursor((c) => ({ ...c, [engine.level]: c[engine.level] + 1 }));
  };

  const accuracy = engine.totalAnswered ? Math.round((engine.totalCorrect / engine.totalAnswered) * 100) : 0;

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto" data-testid="insights-adaptive-demo-page">
      <div className="flex items-center gap-3 mb-6">
        <SlidersHorizontal className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Adaptive Demo</h1>
          <p className="text-ink2">Verify the difficulty-adjustment rules with real bank questions before wiring into a live exam flow.</p>
        </div>
      </div>

      <Card className="p-5 mb-6 grid sm:grid-cols-4 gap-3 items-end">
        <Select label="Class" testid="ad-filter-class" value={filters.klass} onChange={(e) => setFilters({ ...filters, klass: e.target.value })}>
          <option value="">Class</option>
          {(meta?.classes || []).map((c) => <option key={c} value={c}>Class {c}</option>)}
        </Select>
        <Select label="Subject" testid="ad-filter-subject" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value, chapter: "" })}>
          <option value="">Subject</option>
          {(meta?.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select label="Chapter" testid="ad-filter-chapter" value={filters.chapter} onChange={(e) => setFilters({ ...filters, chapter: e.target.value })}>
          <option value="">All chapters</option>
          {chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
        </Select>
        <Button onClick={load} data-testid="ad-load-button">Load questions</Button>
      </Card>

      {levels === false ? (
        <Card className="p-12 text-center" data-testid="ad-empty"><p className="text-ink2">No questions found for this selection.</p></Card>
      ) : !levels ? (
        <Card className="p-12 text-center" data-testid="ad-idle"><p className="text-ink2">Choose a subject and load questions to start the demo.</p></Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          <Card className="p-6">
            <div className="flex gap-2 mb-6">
              {LEVELS.map((lvl, i) => (
                <div key={lvl} className={`flex-1 text-center py-3 rounded-lg border text-sm font-semibold transition-colors ${i === engine.levelIndex ? "bg-primary text-white border-primary" : "border-line text-ink2"}`} data-testid={`ad-level-pill-${lvl}`}>
                  {lvl}
                </div>
              ))}
            </div>
            {!current ? (
              <p className="text-ink2 text-center py-10" data-testid="ad-no-more-questions">No more questions at this difficulty. Reset to try again.</p>
            ) : (
              <div data-testid="ad-current-question">
                <div className="text-xs uppercase tracking-wide text-ink2 mb-2">{current.questionType} · {current.marks} marks</div>
                <p className="text-ink text-base mb-6 leading-relaxed">{current.question}</p>
                <div className="flex gap-3">
                  <Button onClick={() => answer(true)} data-testid="ad-mark-correct-button"><Check className="w-4 h-4" /> Correct</Button>
                  <Button variant="outline" onClick={() => answer(false)} data-testid="ad-mark-incorrect-button"><X className="w-4 h-4" /> Incorrect</Button>
                </div>
              </div>
            )}
            <Button variant="ghost" className="mt-4" onClick={() => { engine.reset(); setCursor({ Easy: 0, Medium: 0, Hard: 0 }); }} data-testid="ad-reset-button">
              <RotateCcw className="w-4 h-4" /> Reset
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-heading font-bold mb-3">Session stats</h3>
            <dl className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><dt className="text-ink2">Current difficulty</dt><dd className="font-semibold">{engine.level}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2">Correct streak</dt><dd className="font-mono">{engine.correctStreak}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2">Answers / accuracy</dt><dd className="font-mono">{engine.totalAnswered} · {accuracy}%</dd></div>
            </dl>
            <h4 className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Answer log</h4>
            <div className="max-h-64 overflow-y-auto space-y-1.5" data-testid="ad-answer-log">
              {engine.log.map((e) => (
                <div key={e.n} className="flex items-center gap-2 text-xs py-1 border-b border-line/60">
                  <span className="text-ink2 font-mono w-6">#{e.n}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${e.answer === "correct" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{e.answer}</span>
                  <span className="text-ink2">{e.changed ? `${e.previousLevel} → ${e.level}` : `stays ${e.level}`}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
