"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type AdminUser = {
  id: string;
  full_name: string | null;
  role: string;
  account_status: string;
  approved_at: string | null;
  updated_at: string;
  email: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");

      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not load users.");
      }

      setUsers(result.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function updateStatus(userId: string, accountStatus: "active" | "disabled" | "rejected") {
    setActioningId(userId);
    setMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");

      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: userId, account_status: accountStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Update failed.");
      }

      setMessage(`Account ${accountStatus === "active" ? "approved" : accountStatus}.`);
      await loadUsers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setActioningId(null);
    }
  }

  const pendingUsers = users.filter((u) => u.account_status === "pending");
  const otherUsers = users.filter((u) => u.account_status !== "pending");

  const statusBadge = (status: string) => {
    if (status === "active") return "bg-emerald-500/15 text-emerald-300";
    if (status === "pending") return "bg-amber-500/15 text-amber-200";
    return "bg-red-500/15 text-red-300";
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <h1 className="text-2xl font-bold">Admin — User Access</h1>
          <p className="mt-2 text-sm text-slate-400">
            Owner-only. Approve, reject, or disable accounts. Public registration stays off —
            this is the only way a new account becomes active.
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
              {error.toLowerCase().includes("access") && (
                <p className="mt-2 text-xs text-red-300">
                  This page is restricted to the account marked as Owner.
                </p>
              )}
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
              {message}
            </div>
          )}

          {isLoading ? (
            <p className="mt-8 text-sm text-slate-400">Loading…</p>
          ) : (
            <>
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-amber-300">
                  Pending Approval ({pendingUsers.length})
                </h2>
                {pendingUsers.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No accounts waiting for approval.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {pendingUsers.map((user) => (
                      <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
                        <div>
                          <p className="font-semibold">{user.full_name || "(no name set)"}</p>
                          <p className="text-sm text-slate-400">{user.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actioningId === user.id}
                            onClick={() => updateStatus(user.id, "active")}
                            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={actioningId === user.id}
                            onClick={() => updateStatus(user.id, "rejected")}
                            className="rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-10">
                <h2 className="text-lg font-semibold text-slate-300">All Accounts ({otherUsers.length})</h2>
                <div className="mt-4 space-y-2">
                  {otherUsers.map((user) => (
                    <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <div>
                        <p className="font-semibold">
                          {user.full_name || "(no name set)"}{" "}
                          <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                            {user.role}
                          </span>
                        </p>
                        <p className="text-sm text-slate-400">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(user.account_status)}`}>
                          {user.account_status}
                        </span>
                        {user.role !== "owner" && (
                          <>
                            {user.account_status !== "active" && (
                              <button
                                type="button"
                                disabled={actioningId === user.id}
                                onClick={() => updateStatus(user.id, "active")}
                                className="rounded-lg border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                Activate
                              </button>
                            )}
                            {user.account_status === "active" && (
                              <button
                                type="button"
                                disabled={actioningId === user.id}
                                onClick={() => updateStatus(user.id, "disabled")}
                                className="rounded-lg border border-red-500 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                Disable
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
