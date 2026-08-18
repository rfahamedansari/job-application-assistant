"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AuthGuardProps = {
  children: ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [accessMessage, setAccessMessage] = useState("");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/account/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const access = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAccessMessage(
          access.error ?? "Your account does not currently have access."
        );
        setIsChecking(false);
        return;
      }

      if (access.account_status !== "active") {
        const messages: Record<string, string> = {
          pending: "Your registration is pending owner approval.",
          disabled: "Your account has been disabled. Contact the owner.",
          rejected: "Your registration was not approved.",
        };
        setAccessMessage(
          messages[access.account_status] ?? "Your account is not active."
        );
        setIsChecking(false);
        return;
      }

      setIsChecking(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />

          <p className="mt-4 text-sm text-slate-400">
            Checking your session...
          </p>
        </div>
      </main>
    );
  }

  if (accessMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-8 text-center">
          <p className="text-sm font-medium text-amber-300">Account access</p>
          <h1 className="mt-2 text-2xl font-bold">Approval required</h1>
          <p className="mt-4 text-slate-300">{accessMessage}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
            className="mt-6 rounded-lg border border-slate-600 px-5 py-3"
          >
            Return to sign in
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
