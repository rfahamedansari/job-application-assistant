"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type AccountStatus =
  | "pending"
  | "active"
  | "disabled"
  | "rejected";

type MessageType = "success" | "error" | "warning";

function getAccessMessage(errorCode: string | null) {
  switch (errorCode) {
    case "pending":
      return {
        type: "warning" as const,
        text:
          "Your account is waiting for Owner approval. You can sign in after your account has been approved.",
      };

    case "rejected":
      return {
        type: "error" as const,
        text:
          "Your account registration was rejected. Please contact the Owner if you believe this was a mistake.",
      };

    case "disabled":
      return {
        type: "error" as const,
        text:
          "Your account is currently disabled. Please contact the Owner to request access.",
      };

    case "profile":
      return {
        type: "error" as const,
        text:
          "Your account access profile could not be verified. Please contact the Owner.",
      };

    case "approval":
      return {
        type: "error" as const,
        text:
          "Your account is not currently approved for access.",
      };

    default:
      return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<MessageType>("error");

  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] =
    useState(false);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    const accessMessage = getAccessMessage(errorCode);

    if (accessMessage) {
      setMessage(accessMessage.text);
      setMessageType(accessMessage.type);
    }
  }, [searchParams]);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");

    if (!email.trim()) {
      setMessage("Please enter your email address.");
      setMessageType("error");
      return;
    }

    if (!password) {
      setMessage("Please enter your password.");
      setMessageType("error");
      return;
    }

    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        setMessage(`Login failed: ${error.message}`);
        setMessageType("error");
        return;
      }

      const user = data.user;

      if (!user) {
        await supabase.auth.signOut();

        setMessage(
          "Login could not be completed. Please try again."
        );
        setMessageType("error");
        return;
      }

      /*
       * IMPORTANT:
       * Authentication alone is not enough.
       *
       * The user must also have an active application
       * access profile.
       */
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("account_status, role")
          .eq("id", user.id)
          .limit(1)
          .maybeSingle();

      if (profileError) {
        console.error(
          "Login profile lookup error:",
          profileError
        );

        await supabase.auth.signOut();

        setMessage(
          "Your account access profile could not be verified. Please contact the Owner."
        );
        setMessageType("error");
        return;
      }

      if (!profile) {
        await supabase.auth.signOut();

        setMessage(
          "Your account access profile could not be found. Please contact the Owner."
        );
        setMessageType("error");
        return;
      }

      const accountStatus =
        profile.account_status as AccountStatus;

      /*
       * Only ACTIVE accounts are allowed into Career OS.
       */
      if (accountStatus !== "active") {
        await supabase.auth.signOut();

        switch (accountStatus) {
          case "pending":
            setMessage(
              "Your account is waiting for Owner approval. You can sign in after your account has been approved."
            );
            setMessageType("warning");
            break;

          case "rejected":
            setMessage(
              "Your account registration was rejected. Please contact the Owner if you believe this was a mistake."
            );
            setMessageType("error");
            break;

          case "disabled":
            setMessage(
              "Your account is currently disabled. Please contact the Owner to request access."
            );
            setMessageType("error");
            break;

          default:
            setMessage(
              "Your account is not currently approved for access."
            );
            setMessageType("error");
            break;
        }

        return;
      }

      /*
       * Account is active.
       * Only now do we allow access to Career OS.
       */
      setMessage("Login successful.");
      setMessageType("success");

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);

      await supabase.auth.signOut();

      setMessage(
        error instanceof Error
          ? error.message
          : "Unexpected login error."
      );
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMessage("");

    if (!email.trim()) {
      setMessage(
        "Enter your email address first, then click Forgot Password."
      );
      setMessageType("error");
      return;
    }

    setIsResettingPassword(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/update-password`
          : undefined;

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          {
            redirectTo,
          }
        );

      if (error) {
        setMessage(
          `Password reset failed: ${error.message}`
        );
        setMessageType("error");
        return;
      }

      setMessage(
        "Password reset email sent. Please check your inbox."
      );
      setMessageType("success");
    } catch (error) {
      console.error("Forgot password error:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Unexpected password reset error."
      );
      setMessageType("error");
    } finally {
      setIsResettingPassword(false);
    }
  }

  const messageStyles = {
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",

    error:
      "border-red-500/30 bg-red-500/10 text-red-200",

    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-200",
  };

  return (
    <main className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <p className="text-sm font-semibold text-cyan-400">
            Ahamed AI Career OS
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Welcome back
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Sign in to continue your job search,
            applications and interview preparation.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">

          {message && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
            >
              {message}
            </div>
          )}

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={isLoading}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500 disabled:opacity-60"
              />
            </div>

            <div>

              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-300"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={
                    isResettingPassword || isLoading
                  }
                  className="text-sm text-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResettingPassword
                    ? "Sending..."
                    : "Forgot Password?"}
                </button>
              </div>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={isLoading}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500 disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading
                ? "Signing in..."
                : "Sign In"}
            </button>

          </form>

          <div className="mt-6 border-t border-slate-800 pt-5 text-center">

            <p className="text-sm text-slate-400">
              New here?{" "}

              <Link
                href="/register"
                className="font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Create an account
              </Link>
              . Access is granted by the Owner after you sign up.
            </p>

            <Link
              href="/"
              className="mt-4 inline-block text-sm text-cyan-400 hover:text-cyan-300"
            >
              Return to Home
            </Link>

          </div>

        </div>
      </div>
    </main>
  );
}
