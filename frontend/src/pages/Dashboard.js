import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Users, Database, Gauge, Sparkles, FilePlus2, BookCheck, BarChart3, ArrowUpRight, GraduationCap, Layers, TriangleAlert } from "lucide-react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { Card, Badge, Spinner } from "../components/ui";

const StatCard = ({ icon: Icon, label, value, suffix, testid }) => (
  <Card className="p-5" data-testid={testid}>
    <div className="flex items-center justify-between mb-4">
      <div className="w-10 h-10 rounded-lg bg-accent/40 grid place-items-center text-secondary">
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </div>
    </div>
    <div className="font-mono font-bold text-3xl text-ink tracking-tight">
      {value}<span className="text-ink2 text-xl">{suffix}</span>
    </div>
    <div className="text-sm text-ink2 mt-1">{label}</div>
  </Card>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const nav = useNavigate();
  const { user } = useAuth();
  const subjects = user?.subjects || [];
  const classes = user?.classes || [];

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => setStats(false));
    api.get("/insights/alerts").then(({ data }) => setAlerts(data)).catch(() => setAlerts(null));
  }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const quick = [
    { icon: FilePlus2, title: "Generate Exam", desc: "Blueprint a new paper", to: "/generate" },
    { icon: BookCheck, title: "Published Exams", desc: "Share codes with students", to: "/exams" },
    { icon: Users, title: "Attempts", desc: "Review integrity & scores", to: "/attempts" },
    { icon: BarChart3, title: "Analytics", desc: "Performance dashboards", to: "/analytics" },
  ];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
        <div>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight">{greet}</h1>
          <p className="text-ink2 mt-1">Here's what's happening across your examinations.</p>
        </div>
        <div className="font-mono text-sm text-ink2">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </div>
      </div>

      {(subjects.length > 0 || classes.length > 0) && (
        <div className="mb-8" data-testid="teacher-portfolio">
          <Card className="p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-5 h-5 text-secondary" strokeWidth={1.5} />
              <h2 className="font-heading font-bold text-lg">Your Teaching Portfolio</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink2 mb-2">Assigned Subjects</div>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.length ? subjects.map((s) => <Badge key={s} tone="primary">{s}</Badge>) : <span className="text-sm text-ink2">None assigned</span>}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-ink2 mb-2">Assigned Classes</div>
                <div className="flex flex-wrap gap-1.5">
                  {classes.length ? classes.map((c) => <Badge key={c} tone="neutral">{c}</Badge>) : <span className="text-sm text-ink2">None assigned</span>}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="quick-access">
            {classes.flatMap((c) => subjects.map((s) => ({ c, s }))).map(({ c, s }) => (
              <Card key={`${c}-${s}`} className="p-5" data-testid={`portfolio-${c}-${s}`.replace(/\s+/g, "-")}>
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  <span className="font-heading font-bold text-ink">{c} · {s}</span>
                </div>
                <div className="space-y-1.5">
                  <button onClick={() => nav("/generate")} className="w-full text-left text-sm px-3 py-2 rounded-lg bg-line/40 hover:bg-line text-ink flex items-center justify-between transition-colors">Create Assessment <ArrowUpRight className="w-3.5 h-3.5" /></button>
                  <button onClick={() => nav("/exams")} className="w-full text-left text-sm px-3 py-2 rounded-lg bg-line/40 hover:bg-line text-ink flex items-center justify-between transition-colors">View Previous Exams <ArrowUpRight className="w-3.5 h-3.5" /></button>
                  <button onClick={() => nav("/questions")} className="w-full text-left text-sm px-3 py-2 rounded-lg bg-line/40 hover:bg-line text-ink flex items-center justify-between transition-colors">Question Bank <ArrowUpRight className="w-3.5 h-3.5" /></button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {alerts?.count > 0 && (
        <button onClick={() => nav("/insights/ai")} data-testid="weak-chapter-alert-banner"
          className="w-full text-left mb-8 block">
          <Card className="p-5 border-danger/40 bg-danger/5 hover:border-danger transition-colors flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-danger/10 grid place-items-center text-danger shrink-0">
              <TriangleAlert className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-bold text-ink">
                  {alerts.count} chapter{alerts.count === 1 ? "" : "s"} flagged high-priority to revise
                </span>
                <Badge tone="danger">AI Insights</Badge>
              </div>
              <p className="text-sm text-ink2 mt-1 truncate">
                {alerts.items[0] && `${alerts.items[0].chapter} (${alerts.items[0].subject} · Class ${alerts.items[0].class}) — ${alerts.items[0].classAverageMasteryPct}% mastery`}
                {alerts.count > 1 ? ` and ${alerts.count - 1} more` : ""} · click to see the full rules-based report
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-danger shrink-0 mt-1" />
          </Card>
        </button>
      )}

      {!stats ? (
        <div className="py-20 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
            <StatCard icon={FileText} label="Total Exams" value={stats.totalExams} testid="stat-exams" />
            <StatCard icon={Users} label="Active Students" value={stats.activeStudents} testid="stat-students" />
            <StatCard icon={Database} label="Questions in Bank" value={stats.questionsInBank} testid="stat-questions" />
            <StatCard icon={Gauge} label="Average Score" value={stats.avgScore} suffix="%" testid="stat-avgscore" />
          </div>

          <Card className="p-5 mb-8 flex items-center gap-4" data-testid="ai-graded-banner">
            <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-mono font-bold text-2xl text-ink">{stats.aiGraded}</div>
              <div className="text-sm text-ink2">descriptive answers graded by AI across {stats.submissions} submissions</div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-4 gap-4 mb-8">
            {quick.map((q) => (
              <button
                key={q.to}
                data-testid={`quick-${q.to.slice(1)}`}
                onClick={() => nav(q.to)}
                className="text-left group"
              >
                <Card className="p-5 h-full hover:border-primary transition-colors">
                  <q.icon className="w-6 h-6 text-secondary mb-4" strokeWidth={1.5} />
                  <div className="font-heading font-bold text-ink flex items-center gap-1">
                    {q.title}
                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-sm text-ink2 mt-0.5">{q.desc}</div>
                </Card>
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg">Recent Examinations</h2>
              <Badge tone="neutral">{stats.recentExams.length}</Badge>
            </div>
            {stats.recentExams.length === 0 ? (
              <div className="px-5 py-12 text-center text-ink2" data-testid="recent-empty">
                No exams yet. Generate your first exam to get started.
              </div>
            ) : (
              <div className="divide-y divide-line" data-testid="recent-exams">
                {stats.recentExams.map((e) => (
                  <div key={e.code} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink truncate">{e.name}</div>
                      <div className="text-sm text-ink2">{e.subject} · <span className="font-mono">{e.code}</span></div>
                    </div>
                    <div className="text-sm text-ink2 hidden sm:block">{e.students} students</div>
                    <div className="font-mono text-sm w-16 text-right">{e.avgScore ? `${e.avgScore}%` : "—"}</div>
                    <Badge tone={e.status === "published" ? "success" : "neutral"} className="capitalize">{e.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
