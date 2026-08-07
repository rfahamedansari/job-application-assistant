"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("success");

  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage(
        "Password must be at least 8 characters."
      );
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setMessageType("error");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(
        `Password could not be updated: ${error.message}`
      );
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setMessage(
      "Password updated successfully. Redirecting to login..."
    );
    setMessageType("success");

    await supabase.auth.signOut();

    setTimeout(() => {
      router.replace("/login");
    }, 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">

      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">

        <p className="text-center text-sm font-medium text-cyan-400">
          Ahamed AI Career OS
        </p>

        <h1 className="mt-3 text-center text-3xl font-bold">
          Create a new password
        </h1>

        <p className="mt-3 text-center text-slate-400">
          Enter a new password for your account.
        </p>

        {message && (
          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
              messageType === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {message}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-7 space-y-5"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">
              New password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter new password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Confirm password
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              placeholder="Confirm new password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {isSaving
              ? "Updating Password..."
              : "Update Password"}
          </button>
        </form>

      </section>
    </main>
  );
}