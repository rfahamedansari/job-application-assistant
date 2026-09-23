"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AuthGuardProps = {
  children: ReactNode;
};

type AccountStatus =
  | "pending"
  | "active"
  | "disabled"
  | "rejected";

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          if (mounted) {
            router.replace("/login");
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", session.user.id)
          .limit(1)
          .maybeSingle();

        if (profileError) {
          console.error(
            "AuthGuard profile lookup error:",
            profileError
          );

          await supabase.auth.signOut();

          if (mounted) {
            router.replace("/login?error=profile");
          }

          return;
        }

        if (!profile) {
          await supabase.auth.signOut();

          if (mounted) {
            router.replace("/login?error=profile");
          }

          return;
        }

        const accountStatus =
          profile.account_status as AccountStatus;

        if (accountStatus !== "active") {
          await supabase.auth.signOut();

          if (!mounted) {
            return;
          }

          switch (accountStatus) {
            case "pending":
              router.replace("/login?error=pending");
              break;

            case "rejected":
              router.replace("/login?error=rejected");
              break;

            case "disabled":
              router.replace("/login?error=disabled");
              break;

            default:
              router.replace("/login?error=approval");
              break;
          }

          return;
        }

        if (mounted) {
          setIsChecking(false);
        }
      } catch (error) {
        console.error("AuthGuard unexpected error:", error);

        await supabase.auth.signOut();

        if (mounted) {
          router.replace("/login?error=approval");
        }
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          router.replace("/login");
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />

          <p className="mt-4 text-sm text-slate-400">
            Checking your account access...
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
