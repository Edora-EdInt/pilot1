import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../api";
import { Button, Input } from "../components/ui";

const LOGIN_BG =
  "https://images.pexels.com/photos/7092515/pexels-photo-7092515.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login"); // login | register
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (user && (user.role === "teacher" || user.role === "admin")) nav("/dashboard");
  }, [user, nav]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u =
        mode === "login"
          ? await login(form.email, form.password)
          : await register({ ...form, role: "student" });
      const first = (u.name || "").replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s+/i, "").split(" ")[0] || u.name;
      toast.success(`Welcome, ${first}`);
      nav(u.role === "student" ? "/exam" : "/dashboard");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-bg">
      {/* left / form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12">
        <div className="max-w-md w-full mx-auto">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-lg bg-primary text-white grid place-items-center font-heading font-black text-xl">E</div>
            <span className="font-heading font-extrabold text-2xl tracking-tight">
              Ed<span className="text-primary">ora</span>
            </span>
          </div>

          <h1 className="font-heading font-extrabold text-4xl tracking-tight leading-tight mb-2">
            {mode === "login" ? "Sign in to your workspace" : "Create your account"}
          </h1>
          <p className="text-ink2 leading-relaxed mb-8">
            The AI-graded examination platform for schools and coaching institutes.
          </p>

          {mode === "register" && (
            <p className="text-xs text-ink2 -mt-4 mb-5">
              Public sign-up creates a <span className="font-medium text-ink">student</span> account. Teachers are onboarded by your institution.
            </p>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <Input label="Full name" testid="name-input" value={form.name} onChange={set("name")} required placeholder="Jane Doe" />
            )}
            <Input label="Email" testid="email-input" type="email" value={form.email} onChange={set("email")} required placeholder="you@school.edu" />
            <Input label="Password" testid="password-input" type="password" value={form.password} onChange={set("password")} required placeholder="••••••••" />
            <Button type="submit" className="w-full" disabled={busy} data-testid="submit-auth-button">
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="mt-6 text-sm text-ink2">
            {mode === "login" ? "New to Edora?" : "Already have an account?"}{" "}
            <button
              data-testid="toggle-auth-mode"
              className="text-primary font-medium hover:underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-line">
            <button
              data-testid="take-exam-link"
              onClick={() => nav("/exam")}
              className="inline-flex items-center gap-2 text-sm font-medium text-secondary hover:text-secondaryHover"
            >
              <GraduationCap className="w-4 h-4" strokeWidth={1.5} />
              I'm a student — take an exam with a code
            </button>
          </div>

          <p className="mt-8 text-xs text-ink2/70 font-mono">
            Demo teacher: teacher@edora.io / Edora@2026
          </p>
        </div>
      </div>

      {/* right / image */}
      <div className="hidden md:block relative">
        <img src={LOGIN_BG} alt="Student focused on an exam" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-secondary/70" />
        <div className="absolute inset-0 grain opacity-20" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <blockquote className="font-heading font-medium text-2xl leading-snug max-w-md">
            "Blueprint an exam, generate distinct variants, and let AI grade descriptive answers in seconds."
          </blockquote>
          <div className="mt-6 flex items-center gap-8 font-mono">
            <div><div className="text-3xl font-bold">850+</div><div className="text-white/70 text-sm">CBSE questions</div></div>
            <div><div className="text-3xl font-bold">6</div><div className="text-white/70 text-sm">question types</div></div>
            <div><div className="text-3xl font-bold">AI</div><div className="text-white/70 text-sm">graded</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
