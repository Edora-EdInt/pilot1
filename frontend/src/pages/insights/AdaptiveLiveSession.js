import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Radio, Copy, XCircle, Users } from "lucide-react";
import api from "../../api";
import { Card, Select, Button, Badge, Spinner } from "../../components/ui";

export default function AdaptiveLiveSession() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ board: "CBSE", klass: "", subject: "", chapter: "" });
  const [chapters, setChapters] = useState([]);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState(null);
  const [detail, setDetail] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => { api.get("/insights/meta").then(({ data }) => setMeta(data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!filters.subject) { setChapters([]); return; }
    api.get("/insights/chapters", { params: { subject: filters.subject, klass: filters.klass, board: filters.board } })
      .then(({ data }) => setChapters(data)).catch(() => setChapters([]));
  }, [filters.subject, filters.klass, filters.board]);

  useEffect(() => {
    if (!session || session.status === "closed") { clearInterval(pollRef.current); return; }
    const poll = () => api.get(`/adaptive/sessions/${session.code}`).then(({ data }) => setDetail(data)).catch(() => {});
    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => clearInterval(pollRef.current);
  }, [session]);

  const launch = async () => {
    if (!filters.klass || !filters.subject) { toast.error("Pick a class and subject first."); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/adaptive/sessions", { board: filters.board, klass: Number(filters.klass), subject: filters.subject, chapter: filters.chapter });
      setSession({ ...data, status: "active" });
      toast.success(`Session ${data.code} is live`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not launch a session for this selection.");
    } finally { setCreating(false); }
  };

  const closeSession = async () => {
    try {
      await api.post(`/adaptive/sessions/${session.code}/close`);
      setSession({ ...session, status: "closed" });
      toast.info("Session closed");
    } catch { toast.error("Could not close the session."); }
  };

  const copyCode = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(session.code).then(
        () => toast.success("Code copied"),
        () => toast.error("Couldn't copy — please copy the code manually.")
      );
    } else {
      toast.error("Clipboard not available — please copy the code manually.");
    }
  };

  return (
    <div>
      {!session ? (
        <Card className="p-5 grid sm:grid-cols-4 gap-3 items-end" data-testid="als-launch-form">
          <Select label="Class" testid="als-filter-class" value={filters.klass} onChange={(e) => setFilters({ ...filters, klass: e.target.value })}>
            <option value="">Class</option>
            {(meta?.classes || []).map((c) => <option key={c} value={c}>Class {c}</option>)}
          </Select>
          <Select label="Subject" testid="als-filter-subject" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value, chapter: "" })}>
            <option value="">Subject</option>
            {(meta?.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select label="Chapter" testid="als-filter-chapter" value={filters.chapter} onChange={(e) => setFilters({ ...filters, chapter: e.target.value })}>
            <option value="">All chapters</option>
            {chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
          </Select>
          <Button onClick={launch} disabled={creating} data-testid="als-launch-button">
            {creating ? <Spinner className="w-4 h-4" /> : <Radio className="w-4 h-4" />} Launch Live Session
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="p-6 flex flex-wrap items-center gap-5 justify-between" data-testid="als-active-card">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink2 mb-1">Session code — share with your class</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-4xl tracking-[0.2em] text-primary" data-testid="als-session-code">{session.code}</span>
                <button onClick={copyCode} className="text-ink2 hover:text-ink" data-testid="als-copy-code-button"><Copy className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-ink2 mt-2">
                Class {session.class} · {session.subject}{session.chapter ? ` · ${session.chapter}` : ""} — students go to <span className="font-mono">/practice</span> and enter this code.
              </p>
            </div>
            {session.status === "active" ? (
              <Badge tone="success">Live</Badge>
            ) : (
              <Badge tone="neutral">Closed</Badge>
            )}
          </Card>

          <Card className="p-5" data-testid="als-participants">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold flex items-center gap-2"><Users className="w-4.5 h-4.5 text-primary" /> Live participants {detail ? `(${detail.participants.length})` : ""}</h3>
              <div className="flex gap-2">
                {session.status === "active" && (
                  <Button variant="outline" onClick={closeSession} data-testid="als-close-session-button"><XCircle className="w-4 h-4" /> Close Session</Button>
                )}
                <Button variant="ghost" onClick={() => { setSession(null); setDetail(null); }} data-testid="als-new-session-button">New Session</Button>
              </div>
            </div>
            {!detail?.participants?.length ? (
              <p className="text-sm text-ink2" data-testid="als-no-participants">Nobody has joined yet — share the code above.</p>
            ) : (
              <div className="divide-y divide-line" data-testid="als-participant-list">
                {detail.participants.map((p) => (
                  <div key={p.name} className="py-2.5 flex items-center justify-between gap-3 text-sm" data-testid={`als-participant-${p.name}`.replace(/\s+/g, "-")}>
                    <span className="font-medium text-ink">{p.name}</span>
                    <Badge tone="neutral">{p.level}</Badge>
                    <span className="font-mono text-ink2 ml-auto">{p.totalCorrect}/{p.totalAnswered} · {p.accuracyPct}%</span>
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
