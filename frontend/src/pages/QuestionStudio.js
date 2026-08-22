import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2, Plus, Check, Sparkles, Loader2 } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { Button, Input, Select, Card, Badge, Spinner } from "../components/ui";

const TYPES = ["MCQ", "Assertion Reason", "Very Short Answer", "Short Answer", "Long Answer", "Case Study"];
const DIFFS = ["Easy", "Medium", "Hard"];

export default function QuestionStudio() {
  const [curriculum, setCurriculum] = useState({ subjects: [], chapters: {} });
  const [form, setForm] = useState({ subject: "", chapter: "", questionType: "Short Answer", difficulty: "Medium", count: 3, marks: 3 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/curriculum").then(({ data }) => {
      setCurriculum(data);
      const s = data.subjects[0] || "";
      setForm((f) => ({ ...f, subject: s, chapter: (data.chapters[s] || [])[0] || "" }));
    });
  }, []);

  const chapters = curriculum.chapters[form.subject] || [];
  const set = (k, v) => setForm({ ...form, [k]: v });

  const generate = async () => {
    if (!form.chapter) return toast.error("Pick a chapter first");
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/questions/generate", { ...form, count: Number(form.count), marks: Number(form.marks) });
      setResult(data);
      toast.success(`Added ${data.added} new question(s) to the bank`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto" data-testid="studio-page">
      <div className="flex items-center gap-3 mb-1">
        <Wand2 className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <h1 className="font-heading font-extrabold text-3xl tracking-tight">AI Question Studio</h1>
      </div>
      <p className="text-ink2 mb-8">Auto-generate brand-new questions for any chapter. Approved questions are added straight to your bank.</p>

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Select label="Subject" testid="studio-subject" value={form.subject}
            onChange={(e) => { const s = e.target.value; setForm({ ...form, subject: s, chapter: (curriculum.chapters[s] || [])[0] || "" }); }}>
            {curriculum.subjects.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select label="Chapter" testid="studio-chapter" value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
            {chapters.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label="Question type" testid="studio-type" value={form.questionType} onChange={(e) => set("questionType", e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Select label="Difficulty" testid="studio-difficulty" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {DIFFS.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Input label="How many" testid="studio-count" type="number" min="1" max="10" value={form.count} onChange={(e) => set("count", e.target.value)} />
          <Input label="Marks each" testid="studio-marks" type="number" min="1" max="10" value={form.marks} onChange={(e) => set("marks", e.target.value)} />
        </div>
        <Button onClick={generate} disabled={busy} data-testid="studio-generate-button" className="w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Generating with AI…" : "Generate Questions"}
        </Button>
      </Card>

      {result && (
        <div data-testid="studio-result">
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="success"><Check className="w-3.5 h-3.5" /> {result.added} added to bank</Badge>
            {result.generated !== result.added && <Badge tone="neutral">{result.generated - result.added} duplicate(s) skipped</Badge>}
          </div>
          <div className="space-y-2">
            {result.questions.map((q, i) => (
              <Card key={i} className="p-4" data-testid={`studio-q-${i}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm text-ink leading-relaxed flex-1">{q.question}</p>
                  <Badge tone="accent">{q.marks} marks</Badge>
                </div>
                {q.objective && q.options?.length > 0 && (
                  <ul className="text-sm text-ink2 mt-1 space-y-0.5">
                    {q.options.map((o, j) => (
                      <li key={j} className={q.correctAnswer === String.fromCharCode(65 + j) ? "text-success font-medium" : ""}>
                        ({String.fromCharCode(65 + j)}) {o}
                      </li>
                    ))}
                  </ul>
                )}
                {q.answer && <p className="text-xs text-ink2 mt-2"><span className="font-medium">Model answer:</span> {q.answer}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
