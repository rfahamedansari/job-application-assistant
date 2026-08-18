import { createClient, User } from "@supabase/supabase-js";

export type AccountRole = "owner" | "admin" | "user";
export type AccountStatus = "pending" | "active" | "disabled" | "rejected";

type AccessProfile = {
  id: string;
  full_name: string | null;
  role: AccountRole;
  account_status: AccountStatus;
};

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, anonKey };
}

export function createUserScopedClient(authorization: string | null) {
  const { url, anonKey } = getSupabaseConfig();

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireActiveUser(
  authorization: string | null
): Promise<{ user: User; profile: AccessProfile }> {
  const supabase = createUserScopedClient(authorization);

  if (!supabase) {
    throw new Error("UNAUTHENTICATED");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name,role,account_status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("ACCESS_PROFILE_MISSING");
  }

  if (profile.account_status !== "active") {
    throw new Error(`ACCOUNT_${String(profile.account_status).toUpperCase()}`);
  }

  return { user, profile: profile as AccessProfile };
}

export async function requireOwner(authorization: string | null) {
  const access = await requireActiveUser(authorization);

  if (access.profile.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  return access;
}

export function describeAccessError(error: unknown) {
  const code = error instanceof Error ? error.message : "FORBIDDEN";

  if (code === "UNAUTHENTICATED") {
    return { status: 401, message: "Invalid or expired session." };
  }

  if (code === "ACCESS_PROFILE_MISSING") {
    return { status: 403, message: "Your account access profile is missing." };
  }

  if (code.startsWith("ACCOUNT_")) {
    return { status: 403, message: "Your account is not approved for access." };
  }

  return { status: 403, message: "You do not have access to this action." };
}
