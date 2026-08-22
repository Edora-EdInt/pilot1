import React, { useEffect, useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import api from "../api";
import { Card, Badge, Spinner } from "../components/ui";

function Bars({ data, colorFor }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div className="space-y-2.5">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="text-xs text-ink2 w-16 shrink-0 capitalize">{k}</span>
          <div className="flex-1 h-6 bg-line/50 rounded-md overflow-hidden">
            <div className={`h-full rounded-md transition-all ${colorFor(k)}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="font-mono text-sm w-8 text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics").then(({ data }) => setData(data)).catch(() => setData(false));
  }, []);

  if (!data) return <div className="p-10 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="analytics-page">
      <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Analytics</h1>
      <p className="text-ink2 mb-8">Real performance and integrity metrics computed from {data.totalSubmissions} graded submissions.</p>

      {data.insight && (
        <Card className="p-5 mb-6 border-primary/30 bg-primary/5 flex gap-3" data-testid="ai-insight">
          <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-heading font-bold text-sm mb-0.5">AI Insight</div>
            <p className="text-sm text-ink leading-relaxed">{data.insight}</p>
          </div>
        </Card>
      )}

      {data.totalSubmissions === 0 ? (
        <Card className="p-12 text-center" data-testid="analytics-empty">
          <TrendingUp className="w-10 h-10 text-ink2/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink2">No submissions yet. Analytics populate once students submit exams.</p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-heading font-bold mb-4">Score Distribution</h3>
            <Bars data={data.scoreDistribution} colorFor={() => "bg-primary"} />
          </Card>
          <Card className="p-5">
            <h3 className="font-heading font-bold mb-4">Integrity Distribution</h3>
            <Bars data={data.integrityDistribution}
              colorFor={(k) => (k === "clean" ? "bg-success" : k === "minor" ? "bg-accent" : "bg-danger")} />
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h3 className="font-heading font-bold mb-4">Exam Performance Ranking</h3>
            {data.examPerformance.length === 0 ? (
              <p className="text-sm text-ink2">No graded exams yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {data.examPerformance.map((e, i) => (
                  <div key={i} className="py-2.5 flex items-center gap-3">
                    <span className="font-mono text-ink2 w-6">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink truncate">{e.name}</div>
                      <div className="text-xs text-ink2">{e.subject}</div>
                    </div>
                    <Badge tone={e.avgScore >= 75 ? "success" : e.avgScore >= 50 ? "accent" : "danger"}>{e.avgScore}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
