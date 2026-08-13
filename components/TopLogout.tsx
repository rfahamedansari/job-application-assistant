"use client";

import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const hiddenRoutes = [
  "/login",
  "/register",
  "/update-password",
];

export default function TopLogout() {
  const pathname = usePathname();
  const router = useRouter();

  const hidden = hiddenRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );

  if (hidden) {
    return null;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center justify-end border-b border-slate-800 bg-slate-950/95 px-6 backdrop-blur lg:left-72">
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-xl border border-red-500/40 px-5 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
      >
        Logout
      </button>
    </header>
  );
}
