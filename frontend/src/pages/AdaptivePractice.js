import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { Button, Input, Card, Badge, Spinner } from "../components/ui";

const LEVEL_TONE = { Easy: "success", Medium: "accent", Hard: "danger" };
const LEVEL_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

export default function AdaptivePractice() {
  const nav = useNavigate();
  const [step, setStep] = useState("code"); // code | play | done
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null); // {code, subject, chapter, level}
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null); // {correct, correctAnswer, changed, previousLevel, level}
  const [stats, setStats] = useState({ totalAnswered: 0, totalCorrect: 0 });

  const join = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/adaptive/join", { code: code.trim().toUpperCase(), studentName: name });
      setSession(data);
      setQuestion(data.question);
      setStats({ totalAnswered: data.totalAnswered, totalCorrect: data.totalCorrect });
      setFeedback(null);
      setStep(data.question ? "play" : "done");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not join this session.");
    } finally { setBusy(false); }
  };

  const answer = async (letter) => {
    if (busy || !question) return;
    setBusy(true);
    try {
      const { data } = await api.post("/adaptive/answer", { code: session.code, studentName: name, qid: question.qid, selectedAnswer: letter });
      setFeedback({ ...data, selected: letter });
      setStats({ totalAnswered: data.totalAnswered, totalCorrect: data.totalCorrect });
      setSession((s) => ({ ...s, level: data.level }));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not submit your answer.");
    } finally { setBusy(false); }
  };

  const next = () => {
    if (feedback?.question) {
      setSession({ ...session, level: feedback.level });
      setQuestion(feedback.question);
      setFeedback(null);
    } else {
      setStep("done");
    }
  };

  const restart = () => { setStep("code"); setSession(null); setQuestion(null); setFeedback(null); setCode(""); };

  if (step === "code") {
    return (
      <Shell>
        <Card className="p-8 w-full max-w-md" data-testid="practice-code-card">
          <button onClick={() => nav("/login")} className="text-sm text-ink2 hover:text-ink flex items-center gap-1 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-heading font-extrabold text-3xl tracking-tight mb-1">Join Live Practice</h1>
          <p className="text-ink2 mb-6">Enter the session code your teacher shared. This is ungraded skill-building practice, not a formal exam.</p>
          <div className="space-y-4">
            <Input label="Session code" testid="practice-code-input" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. AB12CD"
              className="font-mono tracking-widest uppercase" maxLength={8} />
            <Input label="Your name" testid="practice-name-input" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Aarav Sharma" />
            <Button className="w-full" disabled={!code || !name || busy} onClick={join} data-testid="practice-join-button">
              {busy ? <Spinner className="w-4 h-4" /> : <>Join <ChevronRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (step === "play" && question) {
    return (
      <Shell>
        <div className="w-full max-w-xl" data-testid="practice-play">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-heading font-bold text-lg">{session.subject}</div>
              <div className="text-xs text-ink2">{session.chapter || "All chapters"} · {name}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={LEVEL_TONE[session.level] || "neutral"} data-testid="practice-level-badge">{session.level}</Badge>
              <span className="font-mono text-sm text-ink2" data-testid="practice-score">{stats.totalCorrect}/{stats.totalAnswered}</span>
            </div>
          </div>

          <Card className="p-6">
            <p className="font-body text-lg text-ink leading-relaxed mb-6 whitespace-pre-line" data-testid="practice-question-text">{question.question}</p>
            <div className="space-y-2.5">
              {question.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = feedback?.selected === letter;
                const isCorrectOpt = feedback && letter === feedback.correctAnswer;
                let cls = "border-line hover:border-ink2 bg-surface";
                if (feedback) {
                  if (isCorrectOpt) cls = "border-success bg-success/10";
                  else if (isSelected) cls = "border-danger bg-danger/10";
                }
                return (
                  <button key={i} data-testid={`practice-option-${letter}`} disabled={!!feedback}
                    onClick={() => answer(letter)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${cls}`}>
                    <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center font-mono text-sm ${isSelected || isCorrectOpt ? "bg-ink text-white" : "bg-line text-ink2"}`}>{letter}</span>
                    <span className="text-ink">{opt}</span>
                    {feedback && isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-success ml-auto shrink-0" />}
                    {feedback && isSelected && !isCorrectOpt && <XCircle className="w-4 h-4 text-danger ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>

            {feedback && (
              <div className="mt-5 flex items-center justify-between gap-3 flex-wrap" data-testid="practice-feedback">
                <p className={`text-sm font-medium ${feedback.correct ? "text-success" : "text-danger"}`}>
                  {feedback.correct ? "Correct!" : "Not quite."}
                  {feedback.changed && (LEVEL_ORDER[feedback.level] > LEVEL_ORDER[feedback.previousLevel]
                    ? <span className="text-ink2 font-normal"> · leveled up to {feedback.level}</span>
                    : <span className="text-ink2 font-normal"> · back to {feedback.level}</span>)}
                </p>
                <Button onClick={next} data-testid="practice-next-button">
                  {feedback.question ? <>Next <ChevronRight className="w-4 h-4" /></> : "Finish"}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="p-8 w-full max-w-md text-center" data-testid="practice-done-card">
        <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Nice work!</h1>
        <p className="text-ink2 mb-4">You answered {stats.totalCorrect} of {stats.totalAnswered} correctly. No more fresh questions left for now — ask your teacher for another round.</p>
        <Button className="w-full" onClick={restart} data-testid="practice-restart-button"><RotateCcw className="w-4 h-4" /> Join Another Session</Button>
      </Card>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute inset-0 grain opacity-[0.15] pointer-events-none" />
      <div className="relative w-full flex justify-center">{children}</div>
    </div>
  );
}
