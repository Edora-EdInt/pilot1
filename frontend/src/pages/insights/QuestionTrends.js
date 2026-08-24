import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, LineChart } from "lucide-react";
import api from "../../api";
import { Card, Spinner, Select } from "../../components/ui";

export default function QuestionTrends() {
  const [meta, setMeta] = useState(null);
  const [subject, setSubject] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    api.get("/insights/question-trends", { params: subject ? { subject } : {} })
      .then(({ data }) => setData(data)).catch(() => setData(false));
  }, [subject]);

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-question-trends-page">
      <div className="flex items-center gap-3 mb-6">
        <LineChart className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Question Trends</h1>
          <p className="text-ink2">Most-tested chapters across your published exams.</p>
        </div>
      </div>
      <div className="max-w-xs mb-6">
        <Select label="Subject" testid="qt-filter-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {(meta?.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      {!data ? (
        <div className="p-16 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : !data.items?.length ? (
        <Card className="p-12 text-center" data-testid="qt-empty"><p className="text-ink2">No exam data matches this filter yet.</p></Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="px-5 py-3 text-sm text-ink2 border-b border-line">
            Covers {data.examsCovered} published exam{data.examsCovered === 1 ? "" : "s"}. Trend compares the later half of exams vs the earlier half.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="qt-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink2 border-b border-line">
                  <th className="px-5 py-3">#</th><th className="px-3 py-3">Chapter</th><th className="px-3 py-3">Subject</th>
                  <th className="px-3 py-3 text-right">In bank</th><th className="px-3 py-3 text-right">Appearances</th><th className="px-3 py-3">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((it) => (
                  <tr key={`${it.board}-${it.class}-${it.subject}-${it.chapter}`} data-testid={`qt-row-${it.rank}`}>
                    <td className="px-5 py-3 font-mono text-ink2">{it.rank}</td>
                    <td className="px-3 py-3 font-medium text-ink">{it.chapter}</td>
                    <td className="px-3 py-3 text-ink2">{it.subject}</td>
                    <td className="px-3 py-3 text-right font-mono">{it.bankQuestions}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">{it.appearances}</td>
                    <td className="px-3 py-3">
                      {it.direction === "up" ? (
                        <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><TrendingUp className="w-3.5 h-3.5" />{it.deltaPct != null ? `+${it.deltaPct}%` : "rising"}</span>
                      ) : it.direction === "down" ? (
                        <span className="inline-flex items-center gap-1 text-danger text-xs font-medium"><TrendingDown className="w-3.5 h-3.5" />{it.deltaPct}%</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-ink2 text-xs font-medium"><Minus className="w-3.5 h-3.5" />stable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
