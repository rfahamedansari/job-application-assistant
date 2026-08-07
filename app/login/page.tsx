"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("error");

  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setIsLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    setIsLoading(false);

    if (error) {
      setMessage("Incorrect email or password.");
      setMessageType("error");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    setMessage("");

    if (!email.trim()) {
      setMessage(
        "Enter your email address first, then click Forgot password."
      );
      setMessageType("error");
      return;
    }

    setIsResetting(true);

    const redirectUrl =
      `${window.location.origin}/update-password`;

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: redirectUrl,
        }
      );

    setIsResetting(false);

    if (error) {
      setMessage(
        `Password recovery email could not be sent: ${error.message}`
      );
      setMessageType("error");
      return;
    }

    setMessage(
      "Password recovery email sent. Please check your inbox."
    );
    setMessageType("success");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">

        <div className="mb-7 text-center">
          <p className="text-sm font-medium text-cyan-400">
            Ahamed AI Career OS
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Welcome back
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Sign in to view jobs, resumes, applications and
            recruiter follow-ups.
          </p>
        </div>

        {message && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              messageType === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
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
              className="mb-2 block text-sm font-medium"
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium"
              >
                Password
              </label>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isResetting}
                className="text-sm font-medium text-cyan-400 hover:text-cyan-300 disabled:opacity-60"
              >
                {isResetting
                  ? "Sending..."
                  : "Forgot password?"}
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-cyan-400"
          >
            Create account
          </Link>
        </p>

      </section>
    </main>
  );
}