import React, { useEffect, useRef, useState } from "react";
import { Radio, ShieldAlert, ShieldCheck, UserCheck, UserX, Eye, Clock } from "lucide-react";
import api from "../api";
import { Card, Badge } from "../components/ui";

function timeAgo(iso) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function LiveProctoring() {
  const [live, setLive] = useState([]);
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const timer = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/proctoring/live");
      setLive(data.live);
      setCount(data.count);
      setPulse((p) => !p);
    } catch (err) {
      console.warn("live proctoring poll failed:", err);
    }
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 3000);
    return () => clearInterval(timer.current);
  }, []);

  const integrityTone = (s) => (s >= 90 ? "success" : s >= 70 ? "accent" : "danger");

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="proctoring-page">
      <div className="flex items-center gap-3 mb-1">
        <Radio className={`w-7 h-7 text-primary ${pulse ? "opacity-100" : "opacity-60"} transition-opacity`} strokeWidth={1.5} />
        <h1 className="font-heading font-extrabold text-3xl tracking-tight">Live Proctoring</h1>
        <Badge tone="primary" className="ml-1" data-testid="live-count">{count} live</Badge>
      </div>
      <p className="text-ink2 mb-8">Real-time view of active exam sessions. Integrity scores update automatically every few seconds.</p>

      {count === 0 ? (
        <Card className="p-12 text-center" data-testid="proctoring-empty">
          <Eye className="w-10 h-10 text-ink2/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink2">No students are taking an exam right now. This feed updates live.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="proctoring-grid">
          {live.map((a) => (
            <Card key={a.id} className="p-5" data-testid={`live-card-${a.id}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-ink truncate">{a.studentName}</div>
                  <div className="text-xs text-ink2">{a.examName} · <span className="font-mono">{a.examCode}</span></div>
                </div>
                <Badge tone={integrityTone(a.integrityScore)} className="font-mono">{a.integrityScore}</Badge>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {a.faceMatch === false ? (
                  <Badge tone="danger"><UserX className="w-3.5 h-3.5" /> Face mismatch</Badge>
                ) : a.identityMethod === "skipped" ? (
                  <Badge tone="neutral"><UserX className="w-3.5 h-3.5" /> Not verified</Badge>
                ) : a.identityValid === false ? (
                  <Badge tone="danger"><UserX className="w-3.5 h-3.5" /> Identity failed</Badge>
                ) : (
                  <Badge tone="success"><UserCheck className="w-3.5 h-3.5" /> Identity OK</Badge>
                )}
                {a.tabSwitches > 0 && <Badge tone="accent"><ShieldAlert className="w-3.5 h-3.5" /> {a.tabSwitches} tab-switch</Badge>}
                {a.events === 0 && <Badge tone="neutral"><ShieldCheck className="w-3.5 h-3.5" /> clean</Badge>}
              </div>

              <div className="flex items-center justify-between text-xs text-ink2 pt-3 border-t border-line">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {timeAgo(a.startedAt)}</span>
                <span className="font-mono">{a.answered} answered</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
