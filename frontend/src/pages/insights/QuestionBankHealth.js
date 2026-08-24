import React, { useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import api from "../../api";
import { Card, Spinner } from "../../components/ui";

const StatBox = ({ label, value }) => (
  <Card className="p-4">
    <div className="font-mono font-bold text-2xl text-ink">{value}</div>
    <div className="text-xs text-ink2 mt-1">{label}</div>
  </Card>
);

export default function QuestionBankHealth() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/insights/bank-health").then(({ data }) => setData(data)).catch(() => setData(false)); }, []);

  if (!data) return <div className="p-16 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-bank-health-page">
      <div className="flex items-center gap-3 mb-6">
        <HeartPulse className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Question Bank Health</h1>
          <p className="text-ink2">Coverage and completeness, target {data.targetQuestions} questions per chapter.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8" data-testid="bh-stats">
        <StatBox label="Total questions" value={data.totals.questions} />
        <StatBox label="Chapters" value={data.totals.chapters} />
        <StatBox label="Subjects" value={data.totals.subjects} />
        <StatBox label="Board x class combos" value={data.totals.boardClassCombinations} />
        <StatBox label="Avg questions / chapter" value={data.totals.avgQuestionsPerChapter} />
        <StatBox label="Overall completeness" value={`${data.totals.overallCompletenessPct}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5" data-testid="bh-coverage">
          <h3 className="font-heading font-bold mb-4">Coverage by board & class</h3>
          <div className="divide-y divide-line">
            {data.coverage.map((c) => (
              <div key={`${c.board}-${c.class}`} className="py-2.5 flex items-center justify-between text-sm">
                <span className="text-ink font-medium">{c.board} · Class {c.class}</span>
                <span className="text-ink2 font-mono">{c.chapterCount} chapters · {c.questionCount} Q</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 max-h-[500px] overflow-y-auto" data-testid="bh-completeness">
          <h3 className="font-heading font-bold mb-4">Chapter completeness</h3>
          <div className="space-y-3">
            {data.completeness.map((c) => (
              <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`}>
                <div className="flex justify-between text-xs text-ink2 mb-1">
                  <span className="truncate">{c.chapter} <span className="text-ink2/70">({c.subject} · Class {c.class})</span></span>
                  <span className="font-mono shrink-0 ml-2">{c.questionCount}/{c.targetQuestions} · {c.percent}%</span>
                </div>
                <div className="h-1.5 bg-line/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c.percent >= 80 ? "bg-success" : c.percent >= 50 ? "bg-accent" : "bg-danger"}`} style={{ width: `${c.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
