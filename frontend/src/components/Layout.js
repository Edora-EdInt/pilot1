import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FilePlus2, BookCheck, Users, BarChart3, LogOut, Menu, X, GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate", label: "Generate Exam", icon: FilePlus2 },
  { to: "/exams", label: "Published Exams", icon: BookCheck },
  { to: "/attempts", label: "Attempts & Integrity", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    nav("/login");
  };

  const SidebarInner = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="w-9 h-9 rounded-lg bg-primary text-white grid place-items-center font-heading font-black text-lg">E</div>
        <span className="font-heading font-extrabold text-xl tracking-tight text-ink">
          Ed<span className="text-primary">ora</span>
        </span>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${to.slice(1)}`}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-secondary text-white" : "text-ink2 hover:text-ink hover:bg-line/60"
              }`
            }
          >
            <Icon className="w-4.5 h-4.5" strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-secondary font-heading font-bold">
            {(user?.name || "?").charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate" data-testid="sidebar-username">{user?.name}</div>
            <div className="text-xs text-ink2 truncate">{user?.email}</div>
          </div>
        </div>
        <Button variant="ghost" className="w-full mt-2 justify-start" onClick={doLogout} data-testid="logout-button">
          <LogOut className="w-4 h-4" strokeWidth={1.5} /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-bg">
      {/* desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-surface border-r border-line sticky top-0 h-screen">
        {SidebarInner}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-surface border-r border-line">{SidebarInner}</aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-line sticky top-0 z-30">
          <button onClick={() => setOpen(true)} data-testid="mobile-menu-button" className="p-2 -ml-2 text-ink">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-heading font-extrabold text-lg">Ed<span className="text-primary">ora</span></span>
          <button onClick={doLogout} className="p-2 -mr-2 text-ink2"><LogOut className="w-5 h-5" /></button>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
