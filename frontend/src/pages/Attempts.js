import React, { useEffect, useState } from "react";
import { X, ShieldAlert, ShieldCheck, Sparkles, CheckCircle2, XCircle, FileDown, UserCheck, UserX } from "lucide-react";
import api, { downloadPdf } from "../api";
import { Card, Badge, Spinner, Button } from "../components/ui";

function integrityTone(s) {
  if (s >= 90) return { tone: "success", label: "Clean" };
  if (s >= 70) return { tone: "accent", label: "Minor" };
  return { tone: "danger", label: "Flagged" };
}

export default function Attempts() {
  const [attempts, setAttempts] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.get("/attempts").then(({ data }) => setAttempts(data)).catch(() => setAttempts([]));
  }, []);

  const open = async (id) => {
    setLoadingDetail(true);
    setDetail({});
    try {
      const { data } = await api.get(`/attempts/${id}`);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="attempts-page">
      <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Attempts & Integrity</h1>
      <p className="text-ink2 mb-8">Server-computed integrity scores and AI-graded results for every submission.</p>

      {!attempts ? (
        <div className="py-20 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : attempts.length === 0 ? (
        <Card className="p-12 text-center" data-testid="attempts-empty">
          <ShieldCheck className="w-10 h-10 text-ink2/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink2">No attempts yet. Students' submissions will show up here.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-12 px-5 py-3 border-b border-line text-xs uppercase tracking-wide text-ink2 font-medium">
            <div className="col-span-3">Student</div><div className="col-span-2">Exam</div>
            <div className="col-span-2">Status</div><div className="col-span-2">Score</div>
            <div className="col-span-2">Integrity</div><div className="col-span-1" />
          </div>
          <div className="divide-y divide-line" data-testid="attempts-list">
            {attempts.map((a) => {
              const it = integrityTone(a.integrityScore);
              return (
                <button key={a.id} onClick={() => open(a.id)} data-testid={`attempt-row-${a.id}`}
                  className="w-full text-left grid grid-cols-2 md:grid-cols-12 gap-2 px-5 py-3.5 hover:bg-line/30 transition-colors items-center">
                  <div className="md:col-span-3 font-medium text-ink">{a.studentName}</div>
                  <div className="md:col-span-2 font-mono text-sm text-ink2">{a.examCode}</div>
                  <div className="md:col-span-2"><Badge tone={a.status === "submitted" ? "success" : "neutral"} className="capitalize">{a.status.replace("_", " ")}</Badge></div>
                  <div className="md:col-span-2 font-mono text-sm">{a.score ? `${a.score.percentage}%` : "—"}</div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Badge tone={it.tone}>{a.integrityScore}</Badge>
                    <span className="text-xs text-ink2 hidden lg:inline">{a.tabSwitches} tab-switch</span>
                  </div>
                  <div className="md:col-span-1 text-right text-ink2 text-sm">View</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="attempt-drawer">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-xl bg-bg h-full overflow-auto">
            <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-heading font-bold text-lg">{loadingDetail ? "Loading…" : detail.studentName}</h2>
              <div className="flex items-center gap-2">
                {detail.id && (
                  <Button variant="outline" onClick={async () => {
                    try { await downloadPdf(`/attempts/${detail.id}/pdf`, `Edora_result_${detail.studentName}.pdf`); }
                    catch {}
                  }} data-testid="download-report-pdf" className="!px-3 !py-2">
                    <FileDown className="w-4 h-4" /> PDF
                  </Button>
                )}
                <button onClick={() => setDetail(null)} className="p-2 text-ink2 hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {loadingDetail ? (
              <div className="py-20 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
            ) : detail.id ? (
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4 text-center"><div className="font-mono font-bold text-2xl">{detail.score?.percentage ?? "—"}%</div><div className="text-xs text-ink2">Score</div></Card>
                  <Card className="p-4 text-center"><div className="font-mono font-bold text-2xl">{detail.score?.marksObtained ?? "—"}</div><div className="text-xs text-ink2">of {detail.score?.maxMarks}</div></Card>
                  <Card className="p-4 text-center"><div className="font-mono font-bold text-2xl">{detail.integrityScore}</div><div className="text-xs text-ink2">Integrity</div></Card>
                </div>

                {(detail.photo || detail.identityCheck) && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-ink2 mb-2">Identity verification</div>
                    <div className="flex items-start gap-3">
                      {detail.photo && <img src={detail.photo} alt="Identity capture" className="w-24 h-24 object-cover rounded-lg border border-line" />}
                      <div className="space-y-1.5">
                        {detail.identityCheck && (
                          detail.identityCheck.method === "skipped" ? (
                            <Badge tone="neutral" data-testid="identity-badge"><UserX className="w-3.5 h-3.5" /> Not verified (skipped)</Badge>
                          ) : (
                            <Badge tone={detail.identityCheck.valid ? "success" : "danger"} data-testid="identity-badge">
                              {detail.identityCheck.valid ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              {detail.identityCheck.valid ? "Face verified" : "Identity check failed"}
                            </Badge>
                          )
                        )}
                        {detail.faceMatch === false && (
                          <Badge tone="danger"><UserX className="w-3.5 h-3.5" /> Face mismatch during exam</Badge>
                        )}
                        {detail.identityCheck?.reason && <p className="text-xs text-ink2 max-w-[16rem]">{detail.identityCheck.reason}</p>}
                      </div>
                    </div>
                  </Card>
                )}

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2 text-ink">
                    <ShieldAlert className="w-4 h-4 text-secondary" />
                    <span className="font-heading font-bold text-sm">Integrity events (server-recorded)</span>
                  </div>
                  {(detail.integrityEvents || []).length === 0 ? (
                    <p className="text-sm text-ink2">No violations recorded.</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {detail.integrityEvents.map((e, i) => (
                        <li key={i} className="flex justify-between font-mono text-xs">
                          <span className="text-ink2">{e.type}</span>
                          <span className="text-ink2/70">{new Date(e.at).toLocaleTimeString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <div>
                  <div className="flex items-center gap-2 mb-2 text-ink">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="font-heading font-bold text-sm">Answer review</span>
                  </div>
                  <div className="space-y-2">
                    {(detail.gradedDetails || []).map((d, i) => (
                      <Card key={i} className="p-4" data-testid={`answer-${i}`}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-sm text-ink leading-relaxed flex-1">{d.question}</p>
                          <Badge tone={d.awarded >= d.maxMarks ? "success" : d.awarded > 0 ? "accent" : "danger"}>
                            {d.awarded}/{d.maxMarks}
                          </Badge>
                        </div>
                        <div className="text-xs text-ink2 space-y-1">
                          <div><span className="font-medium">Answer:</span> {d.studentAnswer}</div>
                          {d.method === "auto" ? (
                            <div className="flex items-center gap-1">
                              {d.correct ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-danger" />}
                              correct answer: <span className="font-mono">{d.correctAnswer}</span>
                            </div>
                          ) : (
                            <div className="text-secondary flex items-start gap-1">
                              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {d.feedback}
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
