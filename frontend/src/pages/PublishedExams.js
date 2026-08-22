import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, BookCheck, Clock, Users } from "lucide-react";
import api from "../api";
import { Card, Badge, Spinner } from "../components/ui";

export default function PublishedExams() {
  const [exams, setExams] = useState(null);

  useEffect(() => {
    api.get("/exams").then(({ data }) => setExams(data)).catch(() => setExams([]));
  }, []);

  const copy = (code) => { navigator.clipboard.writeText(code); toast.success(`Copied ${code}`); };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="exams-page">
      <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Published Exams</h1>
      <p className="text-ink2 mb-8">Share join codes with students. Scores appear here as attempts are submitted.</p>

      {!exams ? (
        <div className="py-20 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : exams.length === 0 ? (
        <Card className="p-12 text-center" data-testid="exams-empty">
          <BookCheck className="w-10 h-10 text-ink2/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink2">No published exams yet. Head to Generate Exam to create one.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="exams-grid">
          {exams.map((e) => (
            <Card key={e.code} className="p-5 flex flex-col" data-testid={`exam-card-${e.code}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-heading font-bold text-ink truncate">{e.name}</h3>
                  <p className="text-sm text-ink2">{e.subject} · Class {e.class}</p>
                </div>
                <Badge tone="secondary">Var {e.variantLabel}</Badge>
              </div>

              <div className="my-4 p-3 bg-line/40 rounded-lg flex items-center justify-between">
                <code className="font-mono font-bold text-xl tracking-widest text-ink">{e.code}</code>
                <button onClick={() => copy(e.code)} className="p-1.5 text-ink2 hover:text-ink" data-testid={`copy-${e.code}`}>
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                <div><div className="font-mono font-bold text-ink">{e.questionCount}</div><div className="text-ink2 text-xs">questions</div></div>
                <div><div className="font-mono font-bold text-ink">{e.totalMarks}</div><div className="text-ink2 text-xs">marks</div></div>
                <div><div className="font-mono font-bold text-ink">{e.duration}′</div><div className="text-ink2 text-xs">duration</div></div>
              </div>

              <div className="mt-auto pt-3 border-t border-line flex items-center justify-between text-sm">
                <span className="text-ink2 flex items-center gap-1.5"><Users className="w-4 h-4" />{e.submitted} submitted</span>
                <span className="font-mono font-medium">{e.avgScore ? `${e.avgScore}%` : "—"}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
