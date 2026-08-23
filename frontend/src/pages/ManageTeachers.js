import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserCog, Plus, X, Mail, Pencil, Ban, CheckCircle2, Send, ShieldCheck, KeyRound } from "lucide-react";
import api, { formatApiErrorDetail } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Card, Badge, Spinner } from "../components/ui";

const emptyForm = { name: "", email: "", username: "", password: "", subjects: "", classes: "" };

function genPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p + "@" + Math.floor(10 + Math.random() * 89);
}

export default function ManageTeachers() {
  const { user, logout } = useAuth();
  const [teachers, setTeachers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // just-created teacher for credential sharing

  const load = () => api.get("/admin/teachers").then(({ data }) => setTeachers(data)).catch(() => setTeachers([]));
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, password: genPassword() }); setCreated(null); setShowForm(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name || "", email: t.email || "", username: t.username || "", password: "",
      subjects: (t.subjects || []).join(", "), classes: (t.classes || []).join(", ") });
    setCreated(null);
    setShowForm(true);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const parseList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name, email: form.email, subjects: parseList(form.subjects), classes: parseList(form.classes),
      };
      if (editing) {
        if (form.password) payload.password = form.password;
        await api.put(`/admin/teachers/${editing.id}`, payload);
        toast.success("Teacher updated");
        setShowForm(false);
      } else {
        const { data } = await api.post("/admin/teachers", { ...payload, username: form.username, password: form.password });
        toast.success("Teacher account created successfully. Login credentials ready to share.");
        setCreated({ ...data, password: form.password });
      }
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (t) => {
    try {
      const { data } = await api.patch(`/admin/teachers/${t.id}/disable`);
      toast.success(data.disabled ? "Account disabled" : "Account enabled");
      load();
    } catch { toast.error("Could not update account"); }
  };

  const sendCreds = async (t) => {
    try {
      const { data } = await api.post(`/admin/teachers/${t.id}/send-credentials`);
      toast.success(`${data.message} ${data.sentTo ? "→ " + data.sentTo : ""}`);
    } catch { toast.error("Could not prepare credentials"); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto" data-testid="manage-teachers-page">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <UserCog className="w-7 h-7 text-primary" strokeWidth={1.5} />
          <div>
            <h1 className="font-heading font-extrabold text-3xl tracking-tight">Manage Teachers</h1>
            <p className="text-ink2">Create and manage the teaching staff for your school.</p>
          </div>
        </div>
        <Button onClick={openAdd} data-testid="add-teacher-button"><Plus className="w-4 h-4" /> Add Teacher</Button>
      </div>

      <Card className="p-4 mb-6 flex items-center gap-3 bg-accent/20 border-accent/40">
        <ShieldCheck className="w-5 h-5 text-secondary shrink-0" strokeWidth={1.5} />
        <p className="text-sm text-secondary">Signed in as <b>{user?.name}</b> (administrator). Teachers log in with the username & password you assign here.</p>
      </Card>

      {!teachers ? (
        <div className="py-20 grid place-items-center"><Spinner className="w-6 h-6 text-primary" /></div>
      ) : teachers.length === 0 ? (
        <Card className="p-12 text-center" data-testid="teachers-empty">
          <UserCog className="w-10 h-10 text-ink2/40 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink2 mb-4">No teachers yet. Add your first teacher to get started.</p>
          <Button onClick={openAdd}><Plus className="w-4 h-4" /> Add Teacher</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-12 px-5 py-3 border-b border-line text-xs uppercase tracking-wide text-ink2 font-medium">
            <div className="col-span-3">Teacher</div><div className="col-span-2">Username</div>
            <div className="col-span-3">Subjects & Classes</div><div className="col-span-2">Status</div><div className="col-span-2" />
          </div>
          <div className="divide-y divide-line" data-testid="teachers-list">
            {teachers.map((t) => (
              <div key={t.id} className="grid md:grid-cols-12 gap-2 px-5 py-4 items-center" data-testid={`teacher-row-${t.username}`}>
                <div className="md:col-span-3">
                  <div className="font-medium text-ink">{t.name}</div>
                  <div className="text-xs text-ink2">{t.email || "—"}</div>
                </div>
                <div className="md:col-span-2 font-mono text-sm text-ink2">{t.username}</div>
                <div className="md:col-span-3 flex flex-wrap gap-1.5">
                  {(t.subjects || []).map((s) => <Badge key={s} tone="primary">{s}</Badge>)}
                  {(t.classes || []).map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
                </div>
                <div className="md:col-span-2">
                  <Badge tone={t.disabled ? "danger" : "success"}>{t.disabled ? "Disabled" : "Active"}</Badge>
                </div>
                <div className="md:col-span-2 flex items-center gap-1 justify-start md:justify-end">
                  <button title="Send credentials" onClick={() => sendCreds(t)} data-testid={`send-creds-${t.username}`} className="p-2 text-ink2 hover:text-primary"><Send className="w-4 h-4" /></button>
                  <button title="Edit" onClick={() => openEdit(t)} data-testid={`edit-${t.username}`} className="p-2 text-ink2 hover:text-ink"><Pencil className="w-4 h-4" /></button>
                  <button title={t.disabled ? "Enable" : "Disable"} onClick={() => toggle(t)} data-testid={`toggle-${t.username}`} className="p-2 text-ink2 hover:text-danger">
                    {t.disabled ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="teacher-form-modal">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowForm(false)} />
          <Card className="relative w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg">{editing ? "Edit Teacher" : "Add Teacher"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-ink2 hover:text-ink"><X className="w-5 h-5" /></button>
            </div>

            {created ? (
              <div className="p-6" data-testid="created-panel">
                <div className="flex items-center gap-2 text-success mb-2"><CheckCircle2 className="w-5 h-5" /><span className="font-heading font-bold">Teacher account created</span></div>
                <p className="text-sm text-ink2 mb-4">Login credentials are ready to share with {created.name}.</p>
                <Card className="p-4 bg-line/30 space-y-2 mb-4">
                  <div className="flex justify-between text-sm"><span className="text-ink2">Username</span><span className="font-mono font-medium">{created.username}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-ink2">Temporary password</span><span className="font-mono font-medium">{created.password}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-ink2">Email</span><span className="font-mono">{created.email || "—"}</span></div>
                </Card>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => sendCreds(created)} data-testid="send-credentials-button"><Send className="w-4 h-4" /> Send Login Credentials</Button>
                  <Button variant="outline" onClick={() => setShowForm(false)} data-testid="close-created-button">Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={save} className="p-6 space-y-4">
                <Input label="Teacher name" testid="tf-name" value={form.name} onChange={set("name")} required placeholder="Priya Sharma" />
                <Input label="Email" testid="tf-email" type="email" value={form.email} onChange={set("email")} placeholder="teacher@example.com" />
                {!editing && (
                  <>
                    <Input label="Username" testid="tf-username" value={form.username} onChange={set("username")} required placeholder="teacher.math.class12" autoCapitalize="none" />
                    <div className="flex items-end gap-2">
                      <div className="flex-1"><Input label="Temporary password" testid="tf-password" value={form.password} onChange={set("password")} required /></div>
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: genPassword() })} data-testid="tf-regen"><KeyRound className="w-4 h-4" /></Button>
                    </div>
                  </>
                )}
                {editing && (
                  <Input label="Reset password (optional)" testid="tf-password" value={form.password} onChange={set("password")} placeholder="Leave blank to keep current" />
                )}
                <Input label="Subjects (comma separated)" testid="tf-subjects" value={form.subjects} onChange={set("subjects")} placeholder="Mathematics, Physics" />
                <Input label="Classes (comma separated)" testid="tf-classes" value={form.classes} onChange={set("classes")} placeholder="Class 11, Class 12" />
                <Button type="submit" className="w-full" disabled={busy} data-testid="save-teacher-button">
                  {busy ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editing ? "Save changes" : "Create teacher account"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
