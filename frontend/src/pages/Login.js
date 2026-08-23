import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../api";
import { Button, Input } from "../components/ui";

const LOGIN_BG =
  "https://images.pexels.com/photos/7092515/pexels-photo-7092515.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (user && user.role === "admin") nav("/admin");
    else if (user && (user.role === "teacher")) nav("/dashboard");
  }, [user, nav]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(form.username.trim(), form.password);
      const first = (u.name || "").replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s+/i, "").split(" ")[0] || u.name;
      toast.success(`Welcome, ${first}`);
      nav(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-bg">
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12">
        <div className="max-w-md w-full mx-auto">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-lg bg-primary text-white grid place-items-center font-heading font-black text-xl">E</div>
            <span className="font-heading font-extrabold text-2xl tracking-tight">Ed<span className="text-primary">ora</span></span>
          </div>

          <h1 className="font-heading font-extrabold text-4xl tracking-tight leading-tight mb-2">Sign in</h1>
          <p className="text-ink2 leading-relaxed mb-8">Access your school's assessment workspace with the credentials issued to you.</p>

          <form onSubmit={submit} className="space-y-4">
            <Input label="Username" testid="username-input" value={form.username} onChange={set("username")} required placeholder="e.g. teacher.math.class12" autoCapitalize="none" />
            <Input label="Password" testid="password-input" type="password" value={form.password} onChange={set("password")} required placeholder="••••••••" />
            <Button type="submit" className="w-full" disabled={busy} data-testid="submit-auth-button">
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-line/40 text-sm text-ink2 flex gap-2.5">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-secondary" strokeWidth={1.5} />
            <span>Teacher accounts are created by your school administrator. Contact them if you need access.</span>
          </div>

          <div className="mt-6 pt-6 border-t border-line">
            <button data-testid="take-exam-link" onClick={() => nav("/exam")}
              className="inline-flex items-center gap-2 text-sm font-medium text-secondary hover:text-secondaryHover">
              <GraduationCap className="w-4 h-4" strokeWidth={1.5} />
              I'm a student — take an exam with a code
            </button>
          </div>

          <p className="mt-8 text-xs text-ink2/70 font-mono">Admin: admin / Admin@2026 &nbsp;·&nbsp; Teacher: priya.math / Edora@2026</p>
        </div>
      </div>

      <div className="hidden md:block relative">
        <img src={LOGIN_BG} alt="Student focused on an exam" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-secondary/70" />
        <div className="absolute inset-0 grain opacity-20" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <blockquote className="font-heading font-medium text-2xl leading-snug max-w-md">
            "Administrators manage the school. Teachers run the assessments. Everyone stays in their lane."
          </blockquote>
          <div className="mt-6 flex items-center gap-8 font-mono">
            <div><div className="text-3xl font-bold">Admin</div><div className="text-white/70 text-sm">manages staff</div></div>
            <div><div className="text-3xl font-bold">Teacher</div><div className="text-white/70 text-sm">runs exams</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
