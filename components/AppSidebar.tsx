"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Daily Jobs", href: "/jobs" },
  { label: "Resume Library", href: "/resumes" },
  { label: "Applications", href: "/applications" },
  { label: "Profile & Preferences", href: "/profile" },
  { label: "Recruiters", href: "/recruiters" },
  { label: "Interview Prep", href: "/interview-prep" },
  { label: "Analytics", href: "/analytics" },
];

const hiddenRoutes = [
  "/login",
  "/register",
  "/update-password",
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch("/api/account/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const access = await response.json();
      if (active) setIsOwner(access.role === "owner");
    }
    void loadRole();
    return () => { active = false; };
  }, []);

  const hideSidebar = hiddenRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );

  if (hideSidebar) {
    return null;
  }

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-900 text-slate-100">

      {/* BRAND */}
      <div className="border-b border-slate-800 px-6 py-6">
        <Link
          href="/"
          className="text-xl font-bold text-cyan-400"
        >
          Ahamed AI Career OS
        </Link>

        <p className="mt-2 text-sm text-slate-400">
          Career Dashboard
        </p>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-2">
          {navItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-cyan-500 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {isOwner && (
            <Link
              href="/admin"
              className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive("/admin")
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              Admin
            </Link>
          )}
        </div>
      </nav>

    </aside>
  );
}
