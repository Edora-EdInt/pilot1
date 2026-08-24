import React, { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import api from "../../api";
import { Card, Spinner, Select } from "../../components/ui";

export default function ExamPatterns() {
  const [meta, setMeta] = useState(null);
  const [subject, setSubject] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    api.get("/insights/chapter-weightage", { params: subject ? { subject } : {} })
      .then(({ data }) => setData(data)).catch(() => setData(false));
  }, [subject]);

  const scale = data?.items?.length ? Math.max(...data.items.map((i) => i.maxMarks || 0)) : 0;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-exam-patterns-page">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Exam Patterns</h1>
          <p className="text-ink2">Typical marks-weightage each chapter occupies across your published exams.</p>
        </div>
      </div>
      <div className="max-w-xs mb-6">
        <Select label="Subject" testid="ep-filter-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {(meta?.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      {!data ? (
        <div className="p-16 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : !data.items?.length || !scale ? (
        <Card className="p-12 text-center" data-testid="ep-empty"><p className="text-ink2">No exam weightage data yet — publish exams referencing these chapters.</p></Card>
      ) : (
        <Card className="p-5 divide-y divide-line" data-testid="ep-list">
          {data.items.map((it) => {
            const left = (it.minMarks / scale) * 100;
            const width = Math.max(1.5, ((it.maxMarks - it.minMarks) / scale) * 100);
            const avgLeft = (it.avgMarks / scale) * 100;
            return (
              <div key={`${it.board}-${it.class}-${it.subject}-${it.chapter}`} className="grid sm:grid-cols-[220px_1fr_160px] gap-4 items-center py-3.5"
                data-testid={`ep-row-${it.chapter}`.replace(/\s+/g, "-")}>
                <div>
                  <div className="text-sm font-medium text-ink truncate">{it.chapter}</div>
                  <div className="text-xs text-ink2">{it.subject} · {it.board} · Class {it.class} · seen in {it.examsAppearedIn} exam{it.examsAppearedIn === 1 ? "" : "s"}</div>
                </div>
                <div className="relative h-3 bg-line/50 rounded-full">
                  <div className="absolute h-3 rounded-full bg-primary/25 border border-primary/40" style={{ left: `${left}%`, width: `${width}%` }} />
                  <div className="absolute w-0.5 h-4 -top-0.5 bg-primary rounded" style={{ left: `${avgLeft}%` }} />
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">{it.minMarks}–{it.maxMarks} marks</div>
                  <div className="text-xs text-ink2">avg {it.avgMarks}{it.avgSharePct != null ? ` · ${it.avgSharePct}% of paper` : ""}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
