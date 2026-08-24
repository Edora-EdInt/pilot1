import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import api from "../../api";
import { Card, Select, Input, Button, Spinner } from "../../components/ui";
import PracticeResult from "./PracticeResult";

export default function PracticeGenerator() {
  const [students, setStudents] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/insights/students").then(({ data }) => { setStudents(data); if (data[0]) setStudentName(data[0].name); })
      .catch(() => setStudents([]));
  }, []);

  const generate = async () => {
    if (!studentName) return;
    setBusy(true); setResult(null);
    try {
      const { data } = await api.post("/insights/practice/generate", { studentName, questionCount: Number(count) || 10 });
      setResult(data);
    } catch (err) { toast.error("Could not generate a practice set for this student."); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto" data-testid="insights-practice-generator-page">
      <div className="flex items-center gap-3 mb-6">
        <Shuffle className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Practice Generator</h1>
          <p className="text-ink2">Real questions from the bank, targeted at a student's weakest chapters.</p>
        </div>
      </div>

      <Card className="p-5 mb-6 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Select label="Student" testid="pg-student-select" value={studentName} onChange={(e) => setStudentName(e.target.value)}>
            {!students?.length && <option value="">{students === null ? "Loading…" : "No graded students yet"}</option>}
            {(students || []).map((s) => <option key={s.name} value={s.name}>{s.name} · {s.scorePct}%</option>)}
          </Select>
        </div>
        <div className="w-28"><Input label="Count" testid="pg-count-input" type="number" min={1} max={30} value={count} onChange={(e) => setCount(e.target.value)} /></div>
        <Button onClick={generate} disabled={busy || !studentName} data-testid="pg-generate-button">
          {busy ? <Spinner className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />} Generate Practice Test
        </Button>
      </Card>

      {result && <PracticeResult result={result} />}
    </div>
  );
}
