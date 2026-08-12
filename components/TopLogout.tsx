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
    <button
      type="button"
      onClick={handleLogout}
      className="fixed right-6 top-5 z-50 rounded-xl border border-red-500/40 bg-slate-950 px-5 py-2.5 text-sm font-medium text-red-300 shadow-lg hover:bg-red-500/10"
    >
      Logout
    </button>
  );
}