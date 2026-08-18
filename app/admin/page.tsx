"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

type ManagedUser = {
  id: string;
  email: string;
  full_name?: string | null;
  role?: "owner" | "admin" | "user";
  account_status?: "pending" | "active" | "disabled" | "rejected";
  created_at: string;
  last_sign_in_at?: string | null;
};

export default function AdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const request = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in again.");
    const response = await fetch("/api/admin/users", {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Request failed.");
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await request();
      setUsers(payload.users);
      setRegistrationEnabled(payload.registration_enabled);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateUser(user: ManagedUser) {
    setMessage("");
    try {
      await request({
        method: "PATCH",
        body: JSON.stringify({
          action: "update_user",
          user_id: user.id,
          role: user.role ?? "user",
          account_status: user.account_status ?? "pending",
        }),
      });
      setMessage("User access updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }

  async function toggleRegistration() {
    try {
      await request({
        method: "PATCH",
        body: JSON.stringify({
          action: "registration",
          registration_enabled: !registrationEnabled,
        }),
      });
      setRegistrationEnabled(!registrationEnabled);
      setMessage(`Registration ${!registrationEnabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }

  function editUser(id: string, changes: Partial<ManagedUser>) {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes } : user));
  }

  return (
    <AuthGuard>
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-cyan-400">Owner Administration</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="mt-2 text-slate-400">Approve, disable and assign application roles.</p>
          </div>
          <button onClick={toggleRegistration} className="rounded-lg border border-cyan-500 px-4 py-3 text-cyan-300">
            Registration: {registrationEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {message && <p className="mt-6 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-cyan-100">{message}</p>}

        <div className="mt-8 space-y-4">
          {loading ? <p className="text-slate-400">Loading users...</p> : users.map((user) => (
            <article key={user.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
                <div>
                  <h2 className="font-semibold">{user.full_name || "Unnamed user"}</h2>
                  <p className="text-sm text-slate-400">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">Registered {new Date(user.created_at).toLocaleDateString()}</p>
                </div>
                <label className="text-sm">Role
                  <select value={user.role ?? "user"} onChange={(event) => editUser(user.id, { role: event.target.value as ManagedUser["role"] })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <option value="owner">Owner</option><option value="admin">Admin</option><option value="user">User</option>
                  </select>
                </label>
                <label className="text-sm">Status
                  <select value={user.account_status ?? "pending"} onChange={(event) => editUser(user.id, { account_status: event.target.value as ManagedUser["account_status"] })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <option value="pending">Pending</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="rejected">Rejected</option>
                  </select>
                </label>
                <button onClick={() => updateUser(user)} className="rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950">Save</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
    </AuthGuard>
  );
}
