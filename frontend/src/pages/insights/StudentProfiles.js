import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Shuffle } from "lucide-react";
import api from "../../api";
import { Card, Badge, Spinner, Button, Input, Select } from "../../components/ui";
import PracticeResult from "./PracticeResult";

const READINESS_TONE = { Excellent: "success", Good: "primary", "Needs Work": "accent", "At Risk": "danger" };

export default function StudentProfiles() {
  const [meta, setMeta] = useState(null);
  const [klass, setKlass] = useState("");
  const [students, setStudents] = useState(null);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState(null);
  const [mastery, setMastery] = useState(null);
  const [typeBreakdown, setTypeBreakdown] = useState(null);
  const [practiceCount, setPracticeCount] = useState(10);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => {}); }, []);

  useEffect(() => {
    setStudents(null); setSelected(""); setPracticeResult(null);
    api.get("/insights/students", { params: klass ? { klass } : {} })
      .then(({ data }) => { setStudents(data); if (data[0]) setSelected(data[0].name); })
      .catch(() => setStudents([]));
  }, [klass]);

  useEffect(() => {
    if (!selected) { setSummary(null); setMastery(null); setTypeBreakdown(null); return; }
    setSummary(null); setMastery(null); setTypeBreakdown(null); setPracticeResult(null);
    const enc = encodeURIComponent(selected);
    Promise.all([
      api.get(`/insights/students/${enc}/summary`),
      api.get(`/insights/students/${enc}/chapter-mastery`),
      api.get(`/insights/students/${enc}/type-breakdown`),
    ]).then(([a, b, c]) => { setSummary(a.data); setMastery(b.data); setTypeBreakdown(c.data); })
      .catch(() => setSummary(false));
  }, [selected]);

  const generatePractice = async () => {
    setPracticeBusy(true);
    try {
      const { data } = await api.post("/insights/practice/generate", { studentName: selected, questionCount: Number(practiceCount) || 10 });
      setPracticeResult(data);
    } catch (err) { toast.error("Could not generate a practice set."); }
    finally { setPracticeBusy(false); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-student-profiles-page">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Student Profiles</h1>
          <p className="text-ink2">Per-student mastery, readiness and mistake patterns from real graded attempts.</p>
        </div>
      </div>

      <div className="max-w-xs mb-6">
        <Select label="Class" testid="sp-filter-class" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">All classes</option>
          {(meta?.classes || []).map((c) => <option key={c} value={c}>Class {c}</option>)}
        </Select>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="p-2 max-h-[600px] overflow-y-auto" data-testid="sp-student-list">
          {!students ? (
            <div className="p-8 grid place-items-center"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : students.length === 0 ? (
            <p className="text-sm text-ink2 p-4" data-testid="sp-empty">No graded attempts yet for this class.</p>
          ) : students.map((s) => (
            <button key={s.name} onClick={() => setSelected(s.name)} data-testid={`sp-student-${s.name}`.replace(/\s+/g, "-")}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${selected === s.name ? "bg-primary/10" : "hover:bg-line/50"}`}>
              <span className={`text-sm font-medium truncate ${selected === s.name ? "text-primary" : "text-ink"}`}>{s.name}</span>
              <span className="text-xs font-mono text-ink2 shrink-0">{s.scorePct}%</span>
            </button>
          ))}
        </Card>

        <div className="space-y-5">
          <Card className="p-6 min-h-[300px]">
            {!selected ? (
              <p className="text-ink2">Select a student to see their profile.</p>
            ) : !summary ? (
              <div className="p-8 grid place-items-center"><Spinner className="w-5 h-5 text-primary" /></div>
            ) : (
              <div data-testid="sp-detail">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-heading font-bold text-xl">{summary.name}</h2>
                  <Badge tone={READINESS_TONE[summary.readiness] || "neutral"}>{summary.readiness} · {summary.totals.scorePct}%</Badge>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                  {[["Answers", summary.totals.answers], ["Correct", summary.totals.correct], ["Mistakes", summary.totals.incorrect],
                    ["Exams taken", summary.totals.examsTaken], ["Chapters touched", summary.totals.chaptersTouched]].map(([k, v]) => (
                    <div key={k}><dt className="text-xs uppercase tracking-wide text-ink2">{k}</dt><dd className="font-mono font-bold text-lg">{v}</dd></div>
                  ))}
                </dl>

                <h3 className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Chapter mastery (weakest first)</h3>
                {!mastery?.chapters?.length ? <p className="text-sm text-ink2 mb-6">No chapter data yet.</p> : (
                  <div className="space-y-2.5 mb-6" data-testid="sp-chapter-mastery">
                    {mastery.chapters.map((c) => (
                      <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`}>
                        <div className="flex justify-between text-xs text-ink2 mb-1">
                          <span className="truncate">{c.chapter} <span className="text-ink2/70">({c.subject})</span></span>
                          <span className="font-mono shrink-0 ml-2">{c.marksEarned}/{c.marksPossible} · {c.masteryPct}%</span>
                        </div>
                        <div className="h-1.5 bg-line/60 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.masteryPct >= 80 ? "bg-success" : c.masteryPct >= 60 ? "bg-accent" : "bg-danger"}`} style={{ width: `${c.masteryPct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div className="border border-line rounded-lg p-3.5">
                    <div className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Strong areas · &ge;{mastery?.strongChapterPct}%</div>
                    {!mastery?.strongAreas?.length ? <p className="text-sm text-ink2">None yet</p> : mastery.strongAreas.map((c) => (
                      <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`} className="text-sm flex justify-between py-1"><span>{c.chapter}</span><span className="font-mono">{c.masteryPct}%</span></div>
                    ))}
                  </div>
                  <div className="border border-line rounded-lg p-3.5">
                    <div className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Needs improvement · &lt;{mastery?.weakChapterPct}%</div>
                    {!mastery?.needsImprovement?.length ? <p className="text-sm text-ink2">None yet</p> : mastery.needsImprovement.map((c) => (
                      <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`} className="text-sm flex justify-between py-1"><span>{c.chapter}</span><span className="font-mono">{c.masteryPct}%</span></div>
                    ))}
                  </div>
                </div>

                <h3 className="text-xs uppercase tracking-wide text-ink2 font-semibold mb-2">Mistakes by question type</h3>
                {!typeBreakdown?.breakdown?.length || !typeBreakdown.totals.mistakes ? (
                  <p className="text-sm text-ink2" data-testid="sp-no-mistakes">No mistakes recorded — nothing to diagnose yet.</p>
                ) : (
                  <div className="space-y-2" data-testid="sp-type-breakdown">
                    {typeBreakdown.mostCommon && (
                      <p className="text-sm text-ink2 mb-1">Most common: <b className="text-ink">{typeBreakdown.mostCommon.type}</b> ({typeBreakdown.mostCommon.count} of {typeBreakdown.totals.mistakes} mistakes)</p>
                    )}
                    {typeBreakdown.breakdown.filter((b) => b.count > 0).map((b) => (
                      <div key={b.type} className="flex items-center gap-3">
                        <span className="text-xs text-ink2 w-32 shrink-0 truncate">{b.type}</span>
                        <div className="flex-1 h-5 bg-line/50 rounded-md overflow-hidden"><div className="h-full bg-danger/70 rounded-md" style={{ width: `${b.pct}%` }} /></div>
                        <span className="font-mono text-xs w-16 text-right">{b.count} · {b.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {selected && summary && (
            <Card className="p-5" data-testid="sp-practice-bar">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="w-28"><Input label="Count" testid="sp-practice-count" type="number" min={1} max={30} value={practiceCount} onChange={(e) => setPracticeCount(e.target.value)} /></div>
                <Button onClick={generatePractice} disabled={practiceBusy} data-testid="sp-generate-practice-button">
                  {practiceBusy ? <Spinner className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />} Generate Practice Test
                </Button>
              </div>
            </Card>
          )}
          {practiceResult && <PracticeResult result={practiceResult} />}
        </div>
      </div>
    </div>
  );
}
