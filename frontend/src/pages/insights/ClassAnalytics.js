import React, { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import api from "../../api";
import { Card, Badge, Spinner, Select } from "../../components/ui";

const READINESS_TONE = { Excellent: "success", Good: "primary", "Needs Work": "accent", "At Risk": "danger" };
const READINESS_BG = { Excellent: "bg-success", Good: "bg-primary", "Needs Work": "bg-accent", "At Risk": "bg-danger" };

export default function ClassAnalytics() {
  const [classes, setClasses] = useState(null);
  const [klass, setKlass] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/insights/classes").then(({ data }) => { setClasses(data); if (data[0]) setKlass(String(data[0].class)); })
      .catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!klass) return;
    setData(null);
    api.get(`/insights/classes/${encodeURIComponent(klass)}/analytics`).then(({ data }) => setData(data)).catch(() => setData(false));
  }, [klass]);

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="insights-class-analytics-page">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-7 h-7 text-primary" strokeWidth={1.5} />
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">Class Analytics</h1>
          <p className="text-ink2">Cohort performance, readiness mix, roster and chapter strengths/weaknesses.</p>
        </div>
      </div>

      <div className="max-w-xs mb-6">
        <Select label="Class" testid="ca-filter-class" value={klass} onChange={(e) => setKlass(e.target.value)}>
          {!classes?.length && <option value="">{classes === null ? "Loading…" : "No classes yet"}</option>}
          {(classes || []).map((c) => <option key={c.class} value={c.class}>Class {c.class} ({c.studentCount})</option>)}
        </Select>
      </div>

      {!klass ? (
        <Card className="p-12 text-center" data-testid="ca-empty"><p className="text-ink2">No published exams with graded attempts yet.</p></Card>
      ) : !data ? (
        <div className="p-16 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6" data-testid="ca-stats">
            {[["Average score", `${data.totals.aggregateScorePct}%`], ["Mean student score", `${data.totals.meanStudentScorePct}%`],
              ["Students", data.totals.students], ["Answers analyzed", data.totals.answers],
              ["Exams covered", data.totals.examsCovered], ["Chapters assessed", data.totals.chaptersAssessed]].map(([label, value]) => (
              <Card key={label} className="p-4"><div className="font-mono font-bold text-2xl">{value}</div><div className="text-xs text-ink2 mt-1">{label}</div></Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-5 mb-6">
            <Card className="p-5" data-testid="ca-readiness-mix">
              <h3 className="font-heading font-bold mb-3">Readiness mix</h3>
              <div className="flex h-3.5 rounded-full overflow-hidden bg-line/40 mb-3">
                {data.readinessMix.filter((b) => b.count > 0).map((b) => (
                  <div key={b.label} className={`h-full ${READINESS_BG[b.label] || "bg-line"}`}
                    style={{ width: `${(b.count / data.totals.students) * 100}%` }} title={`${b.label}: ${b.count}`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-ink2">
                {data.readinessMix.map((b) => <span key={b.label}>{b.label} × {b.count}</span>)}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-heading font-bold mb-3">Strong areas</h3>
              <p className="text-xs text-ink2 mb-2">Class mastery &ge; 80% across {data.totals.students} students.</p>
              {!data.strongAreas.length ? <p className="text-sm text-ink2">None yet</p> : data.strongAreas.map((c) => (
                <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`} className="text-sm flex justify-between py-1"><span className="truncate">{c.chapter}</span><span className="font-mono">{c.masteryPct}%</span></div>
              ))}
            </Card>
            <Card className="p-5">
              <h3 className="font-heading font-bold mb-3">Needs improvement</h3>
              <p className="text-xs text-ink2 mb-2">Class mastery &lt; 60% — weakest listed first.</p>
              {!data.needsImprovement.length ? <p className="text-sm text-ink2">None yet</p> : data.needsImprovement.map((c) => (
                <div key={`${c.board}-${c.class}-${c.subject}-${c.chapter}`} className="text-sm flex justify-between py-1"><span className="truncate">{c.chapter}</span><span className="font-mono">{c.masteryPct}%</span></div>
              ))}
            </Card>
          </div>

          <Card className="overflow-hidden" data-testid="ca-roster">
            <div className="px-5 py-4 border-b border-line"><h3 className="font-heading font-bold">Roster by score</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink2 border-b border-line">
                    <th className="px-5 py-3">Student</th><th className="px-3 py-3 text-right">Score</th><th className="px-3 py-3">Readiness</th>
                    <th className="px-3 py-3 text-right">Marks</th><th className="px-3 py-3 text-right">Answers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.roster.map((r) => (
                    <tr key={r.name} data-testid={`ca-roster-row-${r.name}`.replace(/\s+/g, "-")}>
                      <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{r.scorePct}%</td>
                      <td className="px-3 py-3"><Badge tone={READINESS_TONE[r.readiness] || "neutral"}>{r.readiness}</Badge></td>
                      <td className="px-3 py-3 text-right font-mono">{r.marksAwarded}/{r.marksPossible}</td>
                      <td className="px-3 py-3 text-right font-mono">{r.answers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
