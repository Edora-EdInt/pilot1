import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, ShieldCheck, Clock, ChevronLeft, ChevronRight, Check, Sparkles, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Card, Badge, Spinner } from "../components/ui";

export default function StudentExam() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState("code"); // code | identity | instructions | live | result
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(null); // {attemptId, exam}
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const attemptIdRef = useRef(null);
  const attemptTokenRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (user && user.name && !name) setName(user.name);
  }, [user]); // eslint-disable-line

  // ── camera ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast.error("Camera unavailable — you can skip identity capture.");
    }
  };
  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = 320; c.height = 240;
    c.getContext("2d").drawImage(v, 0, 0, 320, 240);
    setPhoto(c.toDataURL("image/jpeg", 0.7));
    stopCamera();
  };

  useEffect(() => {
    if (step === "identity" && !photo) startCamera();
    return () => { if (step !== "identity") stopCamera(); };
  }, [step]); // eslint-disable-line

  // ── integrity monitoring (server-authoritative) ──
  const reportIntegrity = useCallback((type) => {
    const id = attemptIdRef.current;
    const token = attemptTokenRef.current;
    if (!id || !token) return;
    api.post(`/student/${id}/integrity`, { type, token }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== "live") return;
    const onVis = () => { if (document.hidden) reportIntegrity("tab_switch"); };
    const onBlur = () => reportIntegrity("blur");
    const onCopy = () => reportIntegrity("copy");
    const onPaste = () => reportIntegrity("paste");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [step, reportIntegrity]);

  // ── timer ──
  useEffect(() => {
    if (step !== "live") return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(timerRef.current); submit(true); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]); // eslint-disable-line

  // ── flow ──
  const startExam = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/student/start", { code: code.toUpperCase(), studentName: name, photo });
      setAttempt(data);
      attemptIdRef.current = data.attemptId;
      attemptTokenRef.current = data.attemptToken;
      setStep("instructions");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const beginLive = () => {
    setRemaining((attempt.exam.duration || 60) * 60);
    setStep("live");
  };

  const submit = async (auto = false) => {
    if (busy) return;
    setBusy(true);
    clearInterval(timerRef.current);
    try {
      const { data } = await api.post(`/student/${attemptIdRef.current}/submit`, { answers, token: attemptTokenRef.current });
      setResult(data);
      setStep("result");
      if (auto) toast.info("Time's up — exam auto-submitted.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      setBusy(false);
    }
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const questions = attempt?.exam.questions || [];
  const q = questions[idx];
  const answeredCount = Object.values(answers).filter((v) => (v || "").trim()).length;

  // ── screens ──
  if (step === "code") {
    return (
      <Shell>
        <Card className="p-8 w-full max-w-md" data-testid="student-code-card">
          <button onClick={() => nav("/login")} className="text-sm text-ink2 hover:text-ink flex items-center gap-1 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Join an Exam</h1>
          <p className="text-ink2 mb-6">Enter the code your teacher shared with you.</p>
          <div className="space-y-4">
            <Input label="Exam code" testid="exam-code-input" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 8F2K9Q"
              className="font-mono tracking-widest uppercase" maxLength={8} />
            <Input label="Your full name" testid="student-name-input" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Aarav Sharma" />
            <Button className="w-full" disabled={!code || !name || busy}
              onClick={() => setStep("identity")} data-testid="continue-identity-button">
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (step === "identity") {
    return (
      <Shell>
        <Card className="p-8 w-full max-w-md text-center" data-testid="student-identity-card">
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Identity Capture</h1>
          <p className="text-ink2 mb-6">A photo is captured for exam records before you begin.</p>
          <div className="rounded-xl overflow-hidden bg-ink/5 border border-line aspect-[4/3] mb-4 grid place-items-center">
            {photo ? (
              <img src={photo} alt="Captured" className="w-full h-full object-cover" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            )}
          </div>
          {photo ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setPhoto(null); startCamera(); }} data-testid="retake-button">Retake</Button>
              <Button className="flex-1" disabled={busy} onClick={startExam} data-testid="start-with-photo-button">
                {busy ? <Spinner className="w-4 h-4" /> : <Check className="w-4 h-4" />} Confirm & Continue
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" disabled={busy} onClick={startExam} data-testid="skip-photo-button">Skip</Button>
              <Button className="flex-1" onClick={capture} data-testid="capture-button"><Camera className="w-4 h-4" /> Capture</Button>
            </div>
          )}
        </Card>
      </Shell>
    );
  }

  if (step === "instructions") {
    return (
      <Shell>
        <Card className="p-8 w-full max-w-lg" data-testid="student-instructions-card">
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">{attempt.exam.name}</h1>
          <p className="text-ink2 mb-6">{attempt.exam.subject}</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="p-4 text-center"><div className="font-mono font-bold text-xl">{questions.length}</div><div className="text-xs text-ink2">questions</div></Card>
            <Card className="p-4 text-center"><div className="font-mono font-bold text-xl">{attempt.exam.totalMarks}</div><div className="text-xs text-ink2">marks</div></Card>
            <Card className="p-4 text-center"><div className="font-mono font-bold text-xl">{attempt.exam.duration}′</div><div className="text-xs text-ink2">duration</div></Card>
          </div>
          <div className="bg-accent/20 rounded-lg p-4 mb-6 text-sm text-secondary flex gap-2">
            <ShieldCheck className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span>Integrity monitoring is active. Switching tabs or leaving this window is recorded and lowers your integrity score.</span>
          </div>
          <Button className="w-full" onClick={beginLive} data-testid="begin-exam-button">Begin Exam <ChevronRight className="w-4 h-4" /></Button>
        </Card>
      </Shell>
    );
  }

  if (step === "live" && q) {
    const low = remaining < 60;
    return (
      <div className="min-h-screen bg-bg flex flex-col" data-testid="student-live">
        <header className="bg-surface border-b border-line px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="min-w-0">
            <div className="font-heading font-bold text-ink truncate">{attempt.exam.name}</div>
            <div className="text-xs text-ink2">{name}</div>
          </div>
          <div className={`font-mono font-bold text-lg flex items-center gap-2 px-3 py-1.5 rounded-lg ${low ? "bg-danger/10 text-danger" : "bg-line/60 text-ink"}`} data-testid="exam-timer">
            <Clock className="w-4 h-4" /> {fmt(remaining)}
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row max-w-6xl w-full mx-auto">
          {/* question */}
          <div className="flex-1 p-6 sm:p-10">
            <div className="flex items-center gap-2 mb-4">
              <Badge tone="secondary">Q{idx + 1} of {questions.length}</Badge>
              <Badge tone="neutral">{q.questionType}</Badge>
              <Badge tone="accent">{q.marks} marks</Badge>
            </div>
            <p className="font-body text-lg text-ink leading-relaxed mb-8 whitespace-pre-line" data-testid="question-text">{q.question}</p>

            {q.objective && q.options?.length ? (
              <div className="space-y-2.5">
                {q.options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const selected = answers[q.qid] === letter;
                  return (
                    <button key={i} data-testid={`option-${letter}`} onClick={() => setAnswers({ ...answers, [q.qid]: letter })}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-line hover:border-ink2 bg-surface"}`}>
                      <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center font-mono text-sm ${selected ? "bg-primary text-white" : "bg-line text-ink2"}`}>{letter}</span>
                      <span className="text-ink">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea data-testid="answer-textarea" value={answers[q.qid] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.qid]: e.target.value })}
                placeholder="Write your answer here…" rows={8}
                className="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink leading-relaxed focus:border-primary" />
            )}

            <div className="flex justify-between mt-8">
              <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)} data-testid="prev-question"><ChevronLeft className="w-4 h-4" /> Previous</Button>
              {idx < questions.length - 1 ? (
                <Button onClick={() => setIdx(idx + 1)} data-testid="next-question">Next <ChevronRight className="w-4 h-4" /></Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => submit(false)} data-testid="submit-exam-button">
                  {busy ? <Spinner className="w-4 h-4" /> : <Check className="w-4 h-4" />} Submit Exam
                </Button>
              )}
            </div>
          </div>

          {/* palette */}
          <aside className="lg:w-64 shrink-0 border-t lg:border-t-0 lg:border-l border-line p-6 bg-surface">
            <div className="text-xs uppercase tracking-wide text-ink2 mb-3">Palette · {answeredCount}/{questions.length} answered</div>
            <div className="grid grid-cols-6 lg:grid-cols-5 gap-2 mb-6">
              {questions.map((qq, i) => {
                const done = (answers[qq.qid] || "").trim();
                return (
                  <button key={qq.qid} data-testid={`palette-${i}`} onClick={() => setIdx(i)}
                    className={`aspect-square rounded-md text-sm font-mono grid place-items-center transition-colors ${
                      i === idx ? "bg-secondary text-white" : done ? "bg-primary/15 text-primary" : "bg-line/60 text-ink2 hover:bg-line"}`}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => submit(false)} data-testid="submit-exam-button-side">
              Submit Exam
            </Button>
          </aside>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    const pct = result.score.percentage;
    const tone = pct >= 75 ? "success" : pct >= 40 ? "accent" : "danger";
    return (
      <Shell>
        <div className="w-full max-w-2xl" data-testid="student-result">
          <Card className="p-8 text-center mb-5">
            <div className={`w-24 h-24 rounded-full grid place-items-center mx-auto mb-4 font-mono font-bold text-2xl ${
              tone === "success" ? "bg-success/10 text-success" : tone === "accent" ? "bg-accent/40 text-secondary" : "bg-danger/10 text-danger"}`}>
              {pct}%
            </div>
            <h1 className="font-heading font-extrabold text-2xl tracking-tight">Exam Submitted</h1>
            <p className="text-ink2 mt-1">
              You scored <span className="font-mono font-bold text-ink">{result.score.marksObtained}</span> of {result.score.maxMarks} marks
            </p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <Badge tone="primary"><Sparkles className="w-3.5 h-3.5" /> {result.aiGraded} AI-graded</Badge>
              <Badge tone="secondary"><ShieldCheck className="w-3.5 h-3.5" /> Integrity {result.integrityScore}</Badge>
            </div>
          </Card>

          <div className="space-y-2">
            {result.details.map((d, i) => (
              <Card key={i} className="p-4" data-testid={`result-answer-${i}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm text-ink leading-relaxed flex-1">{d.question}</p>
                  <Badge tone={d.awarded >= d.maxMarks ? "success" : d.awarded > 0 ? "accent" : "danger"}>{d.awarded}/{d.maxMarks}</Badge>
                </div>
                {d.method === "auto" ? (
                  <div className="text-xs text-ink2 flex items-center gap-1">
                    {d.correct ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-danger" />}
                    Your answer: <span className="font-mono">{d.studentAnswer}</span> · Correct: <span className="font-mono">{d.correctAnswer}</span>
                  </div>
                ) : (
                  <div className="text-xs text-secondary flex items-start gap-1"><Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {d.feedback}</div>
                )}
              </Card>
            ))}
          </div>
          <Button className="w-full mt-6" onClick={() => nav("/login")} data-testid="result-done-button">Done</Button>
        </div>
      </Shell>
    );
  }

  return <Shell><Spinner className="w-6 h-6 text-primary" /></Shell>;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute inset-0 grain opacity-[0.15] pointer-events-none" />
      <div className="relative w-full flex justify-center">{children}</div>
    </div>
  );
}
