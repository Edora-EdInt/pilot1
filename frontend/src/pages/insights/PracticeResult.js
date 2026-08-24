import React from "react";
import { Card, Badge } from "../../components/ui";

const DIFF_TONE = { Easy: "success", Medium: "accent", Hard: "danger" };

export default function PracticeResult({ result }) {
  if (!result) return null;
  const { focusChapters = [], questions = [], totals = {} } = result;
  return (
    <Card className="p-5" data-testid="practice-result">
      <h3 className="font-heading font-bold text-lg mb-2">Generated Practice Set</h3>
      <div className="text-sm text-ink2 mb-3">
        Focus chapters: {focusChapters.length ? focusChapters.map((c) => `${c.chapter} (${c.masteryPct}%)`).join(" · ") : "—"}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-ink2 mb-4">
        <span><b className="text-ink">{totals.delivered}</b> delivered</span>
        <span><b className="text-ink">{totals.requested}</b> requested</span>
        <span><b className="text-ink">{totals.eligiblePoolSize}</b> eligible in pool</span>
        <span><b className="text-ink">{totals.excludedAlreadyCorrect}</b> already mastered</span>
      </div>
      {questions.length === 0 ? (
        <p className="text-sm text-ink2" data-testid="practice-empty">No eligible questions found for this student's weakest chapters.</p>
      ) : (
        <ol className="divide-y divide-line" data-testid="practice-question-list">
          {questions.map((q, i) => (
            <li key={q.qid || i} className="py-3 flex gap-3" data-testid={`practice-q-${i}`}>
              <div className="w-7 h-7 rounded-full bg-line/50 grid place-items-center text-xs font-mono shrink-0">{i + 1}</div>
              <div className="min-w-0">
                <p className="text-sm text-ink mb-1.5">{q.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{q.subject}</Badge>
                  <Badge tone="neutral">{q.chapter}</Badge>
                  <Badge tone={DIFF_TONE[q.difficulty] || "neutral"}>{q.difficulty}</Badge>
                  <Badge tone="primary">{q.questionType} · {q.marks}m</Badge>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
