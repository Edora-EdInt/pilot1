import React from "react";
import { Loader2 } from "lucide-react";

export function Button({ variant = "primary", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-full px-5 py-2.5 text-sm transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-primary text-white hover:bg-primaryHover",
    secondary: "bg-secondary text-white hover:bg-secondaryHover",
    outline: "border border-ink text-ink hover:bg-ink hover:text-white",
    ghost: "text-ink2 hover:text-ink hover:bg-line/60",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, className = "", testid, ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-ink2 mb-1.5 uppercase tracking-wide">{label}</span>}
      <input
        data-testid={testid}
        className={`w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink2/50 focus:border-primary transition-colors ${className}`}
        {...props}
      />
    </label>
  );
}

export function Textarea({ testid, className = "", ...props }) {
  return (
    <textarea
      data-testid={testid}
      className={`w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink leading-relaxed placeholder:text-ink2/50 focus:border-primary transition-colors ${className}`}
      {...props}
    />
  );
}

export function Select({ label, testid, className = "", children, ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-ink2 mb-1.5 uppercase tracking-wide">{label}</span>}
      <select
        data-testid={testid}
        className={`w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink focus:border-primary transition-colors ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`bg-surface border border-line rounded-xl ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className = "", ...props }) {
  const tones = {
    neutral: "bg-line text-ink2",
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    accent: "bg-accent/30 text-secondary",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${tones[tone]} ${className}`} {...props}>
      {children}
    </span>
  );
}

export function Spinner({ className = "" }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg" data-testid="page-loader">
      <Spinner className="w-6 h-6 text-primary" />
    </div>
  );
}
