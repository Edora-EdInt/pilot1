import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookPlus, Plus, Search, Lock, Globe2 } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { Button, Input, Textarea, Select, Card, Badge, Spinner } from "../components/ui";

const TYPES = ["MCQ", "Assertion Reason", "Very Short Answer", "Short Answer", "Long Answer", "Case Study"];
const DIFFS = ["Easy", "Medium", "Hard"];
const CLASSES = [9, 10, 11, 12];
const OBJECTIVE_TYPES = ["MCQ", "Assertion Reason"];

const emptyForm = {
  subject: "", chapter: "", grade: 10, questionType: "Short Answer", difficulty: "Medium",
  marks: 1, question: "", options: ["", "", "", ""], correctAnswer: "A", answer: "", visibility: "all",
};

export default function AddQuestion() {
  const [curriculum, setCurriculum] = useState({ subjects: [], chapters: {} });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const [filters, setFilters] = useState({ subject: "", chapter: "", search: "" });
  const [bank, setBank] = useState(null);
  const [bankBusy, setBankBusy] = useState(false);

  useEffect(() => {
    api.get("/curriculum").then(({ data }) => {
      setCurriculum(data);
      const s = data.subjects[0] || "";
      setForm((f) => ({ ...f, subject: s, chapter: (data.chapters[s] || [])[0] || "" }));
    });
  }, []);

  const chapters = curriculum.chapters[form.subject] || [];
  const set = (k, v) => setForm({ ...form, [k]: v });
  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? v : o)) }));
  const isObjective = OBJECTIVE_TYPES.includes(form.questionType);

  const loadBank = async (f = filters) => {
    setBankBusy(true);
    try {
      const params = {};
      if (f.subject) params.subject = f.subject;
      if (f.chapter) params.chapter = f.chapter;
      if (f.search) params.search = f.search;
      const { data } = await api.get("/questions", { params });
      setBank(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBankBusy(false);
    }
  };

  useEffect(() => { loadBank(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.question.trim()) return toast.error("Enter the question text");
    if (!form.chapter) return toast.error("Pick a chapter first");
    setBusy(true);
    try {
      const payload = {
        subject: form.subject, chapter: form.chapter, grade: Number(form.grade),
        questionType: form.questionType, difficulty: form.difficulty, marks: Number(form.marks),
        question: form.question.trim(), visibility: form.visibility,
        options: isObjective ? form.options : [],
        correctAnswer: isObjective ? form.correctAnswer : "",
        answer: isObjective ? "" : form.answer,
      };
      await api.post("/questions", payload);
      toast.success("Question added to the bank");
      setForm((f) => ({ ...emptyForm, subject: f.subject, chapter: f.chapter, grade: f.grade }));
      loadBank();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto" data-testid="add-question-page">
      <div className="flex items-center gap-3 mb-1">
        <BookPlus className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <h1 className="font-heading font-extrabold text-3xl tracking-tight">Add Question</h1>
      </div>
      <p className="text-ink2 mb-8">Write a new question yourself and save it straight into the bank.</p>

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <Select label="Subject" testid="aq-subject" value={form.subject}
            onChange={(e) => { const s = e.target.value; setForm({ ...form, subject: s, chapter: (curriculum.chapters[s] || [])[0] || "" }); }}>
            {curriculum.subjects.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select label="Chapter" testid="aq-chapter" value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
            {chapters.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label="Class" testid="aq-class" value={form.grade} onChange={(e) => set("grade", e.target.value)}>
            {CLASSES.map((c) => <option key={c} value={c}>Class {c}</option>)}
          </Select>
          <Select label="Question type" testid="aq-type" value={form.questionType} onChange={(e) => set("questionType", e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Select label="Difficulty" testid="aq-difficulty" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {DIFFS.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Input label="Marks" testid="aq-marks" type="number" min="1" max="10" value={form.marks} onChange={(e) => set("marks", e.target.value)} />
        </div>

        <Textarea label="Question text" testid="aq-question" rows={3} className="mb-4" value={form.question}
          onChange={(e) => set("question", e.target.value)} placeholder="Type the question..." />

        {isObjective ? (
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {form.options.map((o, i) => (
              <Input key={i} testid={`aq-option-${i}`} label={`Option ${String.fromCharCode(65 + i)}`}
                value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
            ))}
            <Select label="Correct answer" testid="aq-correct-answer" value={form.correctAnswer} onChange={(e) => set("correctAnswer", e.target.value)}>
              {form.options.map((_, i) => <option key={i} value={String.fromCharCode(65 + i)}>{String.fromCharCode(65 + i)}</option>)}
            </Select>
          </div>
        ) : (
          <Textarea label="Model answer" testid="aq-answer" rows={3} className="mb-4" value={form.answer}
            onChange={(e) => set("answer", e.target.value)} placeholder="The full model answer..." />
        )}

        <Select label="Who can use this question" testid="aq-visibility" value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
          <option value="all">Entire question bank — every teacher</option>
          <option value="class_subject">Teachers who teach this same class & subject</option>
        </Select>

        <Button onClick={save} disabled={busy} data-testid="aq-save-button" className="w-full mt-5">
          {busy ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {busy ? "Saving…" : "Save Question"}
        </Button>
      </Card>

      <div className="flex items-center gap-3 mb-1">
        <Search className="w-5 h-5 text-primary" strokeWidth={1.5} />
        <h2 className="font-heading font-bold text-xl">Browse Question Bank</h2>
      </div>
      <p className="text-ink2 text-sm mb-4">Shows questions you're allowed to use — bank-wide questions plus any class & subject-restricted ones that match your Teaching Portfolio.</p>

      <Card className="p-4 mb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Select label="Subject" testid="bank-filter-subject" value={filters.subject}
            onChange={(e) => { const f = { ...filters, subject: e.target.value, chapter: "" }; setFilters(f); loadBank(f); }}>
            <option value="">All subjects</option>
            {curriculum.subjects.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select label="Chapter" testid="bank-filter-chapter" value={filters.chapter}
            onChange={(e) => { const f = { ...filters, chapter: e.target.value }; setFilters(f); loadBank(f); }}>
            <option value="">All chapters</option>
            {(curriculum.chapters[filters.subject] || []).map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Search question text" testid="bank-filter-search" value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && loadBank()}
            placeholder="Type & press Enter" />
        </div>
      </Card>

      {bankBusy ? (
        <div className="py-12 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : !bank || bank.length === 0 ? (
        <Card className="p-10 text-center" data-testid="bank-empty">
          <p className="text-ink2">No questions match these filters.</p>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="bank-list">
          {bank.map((q) => (
            <Card key={q.qid} className="p-4" data-testid={`bank-item-${q.qid}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm text-ink leading-relaxed flex-1">{q.question}</p>
                <Badge tone="accent">{q.marks} marks</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="neutral">{q.subject} · Class {q.class}</Badge>
                <Badge tone="neutral">{q.chapter}</Badge>
                <Badge tone="neutral">{q.questionType}</Badge>
                <Badge tone="neutral">{q.difficulty}</Badge>
                {q.visibility === "class_subject" ? (
                  <Badge tone="secondary"><Lock className="w-3 h-3" /> Class & subject{q.ownerName ? ` · by ${q.ownerName}` : ""}</Badge>
                ) : (
                  <Badge tone="success"><Globe2 className="w-3 h-3" /> Entire bank</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
