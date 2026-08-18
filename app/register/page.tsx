"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(true);

  useEffect(() => {
    fetch("/api/register")
      .then(async (response) => {
        const payload = await response.json();
        setRegistrationEnabled(Boolean(payload.registration_enabled));
      })
      .catch(() => setRegistrationEnabled(false))
      .finally(() => setIsCheckingRegistration(false));
  }, []);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!fullName.trim()) {
      setMessage("Please enter your full name.");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      }),
    });
    const payload = await response.json();

    setIsLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Registration could not be completed.");
      return;
    }

    setMessage(payload.message);

    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950 px-6 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-cyan-400">
            Ahamed AI Career OS
          </p>

          <h1 className="mt-2 text-3xl font-bold">Create your account</h1>

          <p className="mt-2 text-sm text-slate-400">
            Registration requires approval from the Career OS owner.
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            {message}
          </div>
        )}

        {!isCheckingRegistration && !registrationEnabled && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            New-user registration is currently closed. Contact the Career OS owner for access.
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label
              htmlFor="fullName"
              className="mb-2 block text-sm font-medium"
            >
              Full name
            </label>

            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ahamed Ansari"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium">
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium"
            >
              Confirm password
            </label>

            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter the password again"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || isCheckingRegistration || !registrationEnabled}
            className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-cyan-400">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
