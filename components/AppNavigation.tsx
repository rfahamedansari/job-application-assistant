"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

export default function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const hideNavigation = hiddenRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );

  if (hideNavigation) {
    return null;
  }

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 text-slate-100">
      {/* TOP BRAND ROW */}
      <div className="flex min-h-16 items-center justify-between px-5">
        <Link
          href="/"
          className="text-lg font-bold text-cyan-400"
        >
          Ahamed AI Career OS
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
        >
          Logout
        </button>
      </div>

      {/* GLOBAL FEATURE NAVIGATION */}
      <nav className="overflow-x-auto border-t border-slate-800 bg-slate-900">
        <div className="flex min-w-max items-center gap-2 px-4 py-3">
          {navItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-cyan-500 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}