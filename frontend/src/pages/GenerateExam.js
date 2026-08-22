import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Check, Copy, ChevronDown, AlertTriangle, Rocket } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { Button, Input, Select, Card, Badge, Spinner } from "../components/ui";

const TYPES = [
  { key: "mcq", label: "MCQ" },
  { key: "assertion", label: "Assertion-Reason" },
  { key: "veryShort", label: "Very Short" },
  { key: "short", label: "Short Answer" },
  { key: "long", label: "Long Answer" },
  { key: "caseStudy", label: "Case Study" },
];

function ComplianceBar({ label, value }) {
  const tone = value >= 90 ? "bg-success" : value >= 60 ? "bg-primary" : "bg-danger";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink2">{label}</span>
        <span className="font-mono font-medium">{value}%</span>
      </div>
      <div className="h-1.5 bg-line rounded-full overflow-hidden">
        <div className={`h-full ${tone} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function GenerateExam() {
  const [curriculum, setCurriculum] = useState({ subjects: [], chapters: {} });
  const [form, setForm] = useState({
    name: "Class 10 Term Exam", subject: "", chapters: [],
    totalMarks: 80, duration: 180,
    difficulty: { easy: 30, medium: 50, hard: 20 },
    questionTypes: { mcq: 20, assertion: 5, veryShort: 15, short: 25, long: 20, caseStudy: 15 },
    variants: 2,
  });
  const [chapOpen, setChapOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);

  useEffect(() => {
    api.get("/curriculum").then(({ data }) => {
      setCurriculum(data);
      const first = data.subjects[0] || "";
      setForm((f) => ({ ...f, subject: first }));
    });
  }, []);

  const chapters = curriculum.chapters[form.subject] || [];
  const diffTotal = form.difficulty.easy + form.difficulty.medium + form.difficulty.hard;
  const typeTotal = useMemo(() => Object.values(form.questionTypes).reduce((a, b) => a + b, 0), [form.questionTypes]);

  const setDiff = (k, v) => setForm({ ...form, difficulty: { ...form.difficulty, [k]: Number(v) } });
  const setType = (k, v) => setForm({ ...form, questionTypes: { ...form.questionTypes, [k]: Number(v) } });
  const toggleChapter = (c) =>
    setForm((f) => ({ ...f, chapters: f.chapters.includes(c) ? f.chapters.filter((x) => x !== c) : [...f.chapters, c] }));

  const buildBlueprint = () => ({
    name: form.name,
    curriculum: { board: "CBSE", grade: 10, subject: form.subject, chapters: form.chapters },
    config: { totalMarks: form.totalMarks, duration: form.duration, questionCount: 0 },
    difficulty: form.difficulty,
    questionTypes: form.questionTypes,
    variants: form.variants,
  });

  const generate = async () => {
    setBusy(true);
    setResult(null);
    setPublished(null);
    try {
      const { data } = await api.post("/exams/generate", { ...buildBlueprint(), seed: null });
      setResult(data);
      setActiveVariant(0);
      toast.success(`Generated ${data.variants.length} variant(s) from ${data.poolSize} eligible questions`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const variant = result.variants[activeVariant];
      const { data } = await api.post("/exams/publish", {
        blueprint: buildBlueprint(),
        variantIndex: activeVariant,
        variantLabel: variant.label,
        qids: variant.questions.map((q) => q.qid),
      });
      setPublished(data);
      toast.success(`Exam published — code ${data.code}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setPublishing(false);
    }
  };

  const variant = result?.variants[activeVariant];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="generate-page">
      <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Generate Exam</h1>
      <p className="text-ink2 mb-8">Blueprint the paper — the engine selects & balances questions and builds distinct variants.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* form */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5 space-y-4">
            <Input label="Exam name" testid="exam-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Subject" testid="subject-select" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value, chapters: [] })}>
                {curriculum.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <div className="relative">
                <span className="block text-xs font-medium text-ink2 mb-1.5 uppercase tracking-wide">Chapters</span>
                <button
                  data-testid="chapters-toggle"
                  onClick={() => setChapOpen(!chapOpen)}
                  className="w-full flex items-center justify-between bg-surface border border-line rounded-lg px-3.5 py-2.5 text-sm"
                >
                  <span className="text-ink2">{form.chapters.length ? `${form.chapters.length} selected` : "All chapters"}</span>
                  <ChevronDown className="w-4 h-4 text-ink2" />
                </button>
                {chapOpen && (
                  <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-surface border border-line rounded-lg shadow-lg p-2" data-testid="chapters-dropdown">
                    {chapters.length === 0 && <div className="text-sm text-ink2 px-2 py-1">No chapters</div>}
                    {chapters.map((c) => (
                      <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-line/60 cursor-pointer text-sm">
                        <input type="checkbox" checked={form.chapters.includes(c)} onChange={() => toggleChapter(c)} />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Total Marks" testid="total-marks-input" type="number" value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: Number(e.target.value) })} />
              <Input label="Duration (min)" testid="duration-input" type="number" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
              <Input label="Variants" testid="variants-input" type="number" min="1" max="6" value={form.variants}
                onChange={(e) => setForm({ ...form, variants: Math.max(1, Math.min(6, Number(e.target.value))) })} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold">Difficulty Distribution</h3>
              <Badge tone={diffTotal === 100 ? "success" : "danger"}>{diffTotal}%</Badge>
            </div>
            <div className="space-y-4">
              {["easy", "medium", "hard"].map((k) => (
                <div key={k}>
                  <div className="flex justify-between text-sm mb-1 capitalize">
                    <span>{k}</span><span className="font-mono">{form.difficulty[k]}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={form.difficulty[k]}
                    data-testid={`diff-${k}`}
                    onChange={(e) => setDiff(k, e.target.value)} className="w-full accent-primary" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold">Question Type Mix</h3>
              <Badge tone={typeTotal === 100 ? "success" : "accent"}>{typeTotal}%</Badge>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {TYPES.map((t) => (
                <div key={t.key}>
                  <span className="block text-xs text-ink2 mb-1">{t.label}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" value={form.questionTypes[t.key]}
                      data-testid={`type-${t.key}`}
                      onChange={(e) => setType(t.key, e.target.value)}
                      className="w-full bg-surface border border-line rounded-lg px-2.5 py-2 text-sm font-mono focus:border-primary" />
                    <span className="text-ink2 text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Button onClick={generate} disabled={busy || !form.subject} data-testid="generate-button" className="w-full">
            {busy ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {busy ? "Selecting questions…" : "Generate Exam"}
          </Button>
        </div>

        {/* summary + result */}
        <div className="space-y-5">
          <Card className="p-5 lg:sticky lg:top-6">
            <h3 className="font-heading font-bold mb-4">Summary</h3>
            <dl className="space-y-2.5 text-sm">
              {[["Subject", form.subject || "—"], ["Chapters", form.chapters.length || "All"],
                ["Total Marks", form.totalMarks], ["Duration", `${form.duration} min`],
                ["Variants", form.variants]].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-ink2">{k}</dt><dd className="font-mono font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {/* results */}
      {result && (
        <div className="mt-8" data-testid="generation-result">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="font-heading font-extrabold text-2xl tracking-tight mr-2">Generated Variants</h2>
            {result.variants.map((v, i) => (
              <button key={v.label} data-testid={`variant-tab-${v.label}`} onClick={() => setActiveVariant(i)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  i === activeVariant ? "bg-secondary text-white" : "bg-surface border border-line text-ink2 hover:text-ink"}`}>
                Variant {v.label}
              </button>
            ))}
          </div>

          {variant && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                {variant.warnings?.length > 0 && (
                  <Card className="p-4 border-danger/40 bg-danger/5 flex gap-3" data-testid="variant-warning">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                    <div className="text-sm text-ink space-y-1">{variant.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
                  </Card>
                )}
                {Object.entries(variant.sections).map(([type, qs]) => (
                  <Card key={type} className="overflow-hidden" data-testid={`section-${type}`}>
                    <div className="px-4 py-2.5 bg-line/40 border-b border-line flex justify-between">
                      <span className="font-heading font-bold text-sm">{type}</span>
                      <span className="text-xs text-ink2 font-mono">{qs.length} Q · {qs.reduce((a, q) => a + q.marks, 0)} marks</span>
                    </div>
                    <div className="divide-y divide-line">
                      {qs.map((q, i) => (
                        <div key={q.qid} className="px-4 py-3 flex gap-3">
                          <span className="font-mono text-xs text-ink2 mt-0.5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink leading-relaxed">{q.question}</p>
                            <div className="flex gap-2 mt-1.5">
                              <Badge tone="neutral">{q.difficulty}</Badge>
                              <Badge tone="accent">{q.marks} marks</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="space-y-5">
                <Card className="p-5">
                  <h3 className="font-heading font-bold mb-4">Blueprint Compliance</h3>
                  <div className="space-y-3">
                    <ComplianceBar label="Marks match" value={variant.compliance.marksMatch} />
                    <ComplianceBar label="Difficulty match" value={variant.compliance.difficultyMatch} />
                    <ComplianceBar label="Type match" value={variant.compliance.typeMatch} />
                  </div>
                  <div className="mt-4 pt-4 border-t border-line flex justify-between text-sm">
                    <span className="text-ink2">Selected</span>
                    <span className="font-mono font-medium">{variant.totalMarksSelected} / {variant.compliance.targetMarks} marks</span>
                  </div>
                </Card>

                {result.variants.length > 1 && (
                  <Card className="p-5" data-testid="diversity-card">
                    <h3 className="font-heading font-bold mb-3">Variant Diversity</h3>
                    <div className="space-y-2 text-sm">
                      {variant.similarity.map((s) => (
                        <div key={s.pair} className="flex justify-between">
                          <span className="text-ink2 font-mono">{s.pair}</span>
                          <Badge tone={s.overlap > 30 ? "danger" : "success"}>{s.overlap}% overlap</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {published ? (
                  <Card className="p-5 border-success/40 bg-success/5" data-testid="published-card">
                    <div className="flex items-center gap-2 text-success mb-2">
                      <Check className="w-5 h-5" /><span className="font-heading font-bold">Published</span>
                    </div>
                    <p className="text-sm text-ink2 mb-3">Share this code with students:</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-2xl tracking-widest text-ink" data-testid="published-code">{published.code}</code>
                      <button onClick={() => { navigator.clipboard.writeText(published.code); toast.success("Code copied"); }}
                        className="p-2 text-ink2 hover:text-ink"><Copy className="w-4 h-4" /></button>
                    </div>
                  </Card>
                ) : (
                  <Button variant="secondary" className="w-full" onClick={publish} disabled={publishing} data-testid="publish-button">
                    {publishing ? <Spinner className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                    Publish Variant {variant.label}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
