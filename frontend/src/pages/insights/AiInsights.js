import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Flag, Users, ClipboardList, Target, Download } from "lucide-react";
import api, { downloadPdf } from "../../api";
import { Card, Badge, Select, Spinner, Button } from "../../components/ui";

const PRESETS = {
  revise: { title: "Which chapters should I revise before boards?", icon: Flag },
  risk: { title: "Which students need attention?", icon: Users },
  mistakes: { title: "What kind of mistakes is the class making?", icon: ClipboardList },
};

function AnswerShell({ klass, title, icon: Icon, ruleNote, children }) {
  return (
    <Card className="p-5" data-testid="ai-answer">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-heading font-bold flex items-center gap-2"><Icon className="w-4.5 h-4.5 text-primary" />{title}</h3>
        {klass !== "" && <Badge tone="neutral">Class {klass}</Badge>}
      </div>
      {children}
      <p className="text-xs text-ink2/80 mt-4 pt-3 border-t border-dashed border-line">{ruleNote}</p>
    </Card>
  );
}

function ReviseAnswer({ data, klass }) {
  const items = data.items || [];
  return (
    <AnswerShell klass={klass} title="Which chapters should I revise before boards?" icon={Flag}
      ruleNote={`Rule: chapter mastery below ${data.struggleThreshold}% AND above-median exam weightage. Severity is high when mastery is far below the threshold or most students are under it.`}>
      {items.length === 0 ? (
        <p className="text-sm text-ink2" data-testid="ai-revise-empty">No struggling chapters match the rules for this class right now.</p>
      ) : (
        <div className="space-y-4" data-testid="ai-revise-list">
          {items.map((it) => (
            <div key={`${it.board}-${it.class}-${it.subject}-${it.chapter}`}
              className={`rounded-lg border border-line p-4 border-l-[3px] ${it.severity === "high" ? "border-l-danger" : "border-l-accent"}`}
              data-testid={`ai-revise-${it.chapter}`.replace(/\s+/g, "-")}>
              <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
                <div><div className="font-semibold text-ink">{it.headline}</div><div className="text-xs text-ink2">{it.subject}</div></div>
                <Badge tone={it.severity === "high" ? "danger" : "accent"} className="uppercase">{it.severity} priority</Badge>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-sm mb-3">
                {it.reasons.map((r) => (
                  <div key={r.label}><div className="text-ink2 text-xs">{r.label}</div><div className="font-mono font-semibold">{r.value}</div><div className="text-xs text-ink2/70">{r.detail}</div></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {it.difficultyMix.map((m) => <Badge key={m.level} tone="neutral">{m.level} {m.pct}%</Badge>)}
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary bg-primary/10 rounded-lg px-3 py-2"><Target className="w-4 h-4" />{it.recommendedAction}</div>
            </div>
          ))}
        </div>
      )}
    </AnswerShell>
  );
}

function RiskAnswer({ data, klass }) {
  const items = data.items || [];
  return (
    <AnswerShell klass={klass} title="Which students need attention?" icon={Users}
      ruleNote="Rule: students outside the top readiness band, weakest first, with their weakest chapters and most frequent mistake type.">
      {items.length === 0 ? (
        <p className="text-sm text-ink2" data-testid="ai-risk-empty">Every student in this class is in the top readiness band.</p>
      ) : (
        <div className="divide-y divide-line" data-testid="ai-risk-list">
          {items.map((r, i) => (
            <div key={r.name} className="py-3 flex items-center gap-3 flex-wrap" data-testid={`ai-risk-${r.name}`.replace(/\s+/g, "-")}>
              <span className="font-mono text-ink2 w-6">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink">{r.name}</div>
                <div className="text-xs text-ink2">{r.weakChapters.length ? `Weakest: ${r.weakChapters.map((c) => `${c.chapter} (${c.masteryPct}%)`).join(" · ")}` : "No chapters under the weak threshold."}</div>
              </div>
              <Badge tone="danger">{r.readiness}</Badge>
              <span className="font-mono text-sm w-14 text-right">{r.scorePct}%</span>
              <span className="text-xs text-ink2 w-44 text-right truncate">{r.dominantMistakeType ? `Most mistakes: ${r.dominantMistakeType.type}` : "No dominant mistake type"}</span>
            </div>
          ))}
        </div>
      )}
    </AnswerShell>
  );
}

function MistakesAnswer({ data, klass }) {
  const subjects = data.subjects || [];
  return (
    <AnswerShell klass={klass} title="What kind of mistakes is the class making?" icon={ClipboardList}
      ruleNote="Rule: mistake density per subject = incorrect ÷ analyzed answers; dominant type = most frequent question type among mistakes.">
      {subjects.length === 0 ? (
        <p className="text-sm text-ink2" data-testid="ai-mistakes-empty">No mistake data available for this class.</p>
      ) : (
        <div className="space-y-4" data-testid="ai-mistakes-list">
          {subjects.map((s) => (
            <div key={s.subject} className="border border-line rounded-lg p-4">
              <div className="font-semibold text-ink mb-1">{s.subject}</div>
              <p className="text-xs text-ink2 mb-3">{s.mistakes} mistakes in {s.answersAnalyzed} answers · {s.mistakeDensityPct}% density{s.dominantType ? ` · Dominant: ${s.dominantType.type}` : ""}</p>
              {s.types.filter((t) => t.count > 0).map((t) => (
                <div key={t.type} className="flex justify-between text-sm py-1"><span>{t.type}</span><span className="font-mono">{t.count} · {t.pctOfMistakes}%</span></div>
              ))}
            </div>
          ))}
        </div>
      )}
    </AnswerShell>
  );
}

export default function AiInsights() {
  const [classes, setClasses] = useState(null);
  const [klass, setKlass] = useState("");
  const [kind, setKind] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/insights/classes").then(({ data }) => { setClasses(data); if (data[0]) setKlass(String(data[0].class)); })
      .catch(() => setClasses([]));
  }, []);

  const ask = async (which) => {
    if (!klass) return;
    setBusy(true); setKind(which); setResult(null);
    try {
      const path = which === "revise" ? `classes/${klass}/teaching-recommendations`
        : which === "risk" ? `classes/${klass}/students-at-risk` : `classes/${klass}/mistake-profile`;
      const { data } = await api.get(`/insights/${path}`);
      setResult(data);
    } catch { setResult({ error: true }); }
    finally { setBusy(false); }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadPdf(`/insights/classes/${encodeURIComponent(klass)}/ai-report/pdf`, `Edora_Class${klass}_AI_Insights.pdf`);
      toast.success("AI Insights report downloaded");
    } catch { toast.error("Could not export the PDF."); }
    finally { setExporting(false); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-ai-insights-page">
      <div className="flex items-center gap-3 mb-6 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.5} />
          <div>
            <h1 className="font-heading font-extrabold text-3xl tracking-tight">AI Insights</h1>
            <p className="text-ink2">Rules-based teacher assistant — every answer traces back to a stated rule, no free-form chat.</p>
          </div>
        </div>
        {klass && (
          <Button variant="outline" onClick={exportPdf} disabled={exporting} data-testid="ai-export-pdf-button">
            {exporting ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />} Download Full Report PDF
          </Button>
        )}
      </div>

      <div className="max-w-xs mb-5">
        <Select label="Class" testid="ai-filter-class" value={klass} onChange={(e) => { setKlass(e.target.value); setResult(null); setKind(null); }}>
          {!classes?.length && <option value="">{classes === null ? "Loading…" : "No classes yet"}</option>}
          {(classes || []).map((c) => <option key={c.class} value={c.class}>Class {c.class} ({c.studentCount})</option>)}
        </Select>
      </div>

      <div className="flex flex-wrap gap-2.5 mb-6">
        {Object.entries(PRESETS).map(([key, p]) => (
          <button key={key} onClick={() => ask(key)} disabled={!klass || busy} data-testid={`ai-preset-${key}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-line text-sm font-medium text-ink hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
            <p.icon className="w-4 h-4" /> {p.title}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="p-16 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : !kind ? (
        <Card className="p-12 text-center" data-testid="ai-idle"><p className="text-ink2">Pick a class and a question above to get started.</p></Card>
      ) : result?.error ? (
        <Card className="p-12 text-center" data-testid="ai-error"><p className="text-ink2">Query failed. Please try again.</p></Card>
      ) : kind === "revise" ? <ReviseAnswer data={result} klass={klass} /> : kind === "risk" ? <RiskAnswer data={result} klass={klass} /> : <MistakesAnswer data={result} klass={klass} />}
    </div>
  );
}
