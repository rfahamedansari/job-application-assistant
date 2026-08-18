import { NextRequest, NextResponse } from "next/server";
import {
  AccountRole,
  AccountStatus,
  createAdminClient,
  createUserScopedClient,
  requireOwner,
} from "@/lib/serverAuth";

function accessError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return 401;
  if (message === "FORBIDDEN") return 403;
  return 500;
}

type AdminProfile = {
  id: string;
  full_name: string | null;
  role: AccountRole;
  account_status: AccountStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    await requireOwner(authorization);
    const admin = createAdminClient();
    const ownerClient = createUserScopedClient(authorization);

    if (!ownerClient) throw new Error("UNAUTHENTICATED");

    const [{ data: authData, error: authError }, { data: profiles, error: profileError }, { data: settings, error: settingsError }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        ownerClient.rpc("owner_list_profiles"),
        ownerClient.rpc("owner_get_registration_enabled"),
      ]);

    if (authError) {
      console.error("admin users auth list error", authError);
      return NextResponse.json(
        { error: "User management could not be loaded (Auth Admin)." },
        { status: 500 }
      );
    }

    if (profileError) {
      console.error("admin users profile list error", profileError);
      return NextResponse.json(
        { error: "User management could not be loaded (Profiles)." },
        { status: 500 }
      );
    }

    if (settingsError) {
      console.error("admin users registration settings error", settingsError);
      return NextResponse.json(
        { error: "User management could not be loaded (Registration settings)." },
        { status: 500 }
      );
    }

    const profileRows = (profiles ?? []) as AdminProfile[];
    const profilesById = new Map(
      profileRows.map((profile): [string, AdminProfile] => [profile.id, profile])
    );
    const users = authData.users.map((user) => {
      const profile = profilesById.get(user.id);

      return {
        id: user.id,
        email: user.email ?? "",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        ...(profile ?? {}),
      };
    });

    return NextResponse.json({
      users,
      registration_enabled: Boolean(settings),
    });
  } catch (error) {
    console.error("admin users GET error", error);
    return NextResponse.json(
      { error: "User management could not be loaded." },
      { status: accessError(error) }
    );
  }
}

type UpdateRequest =
  | { action: "update_user"; user_id: string; role: AccountRole; account_status: AccountStatus }
  | { action: "registration"; registration_enabled: boolean };

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const owner = await requireOwner(authorization);
    const body = (await request.json()) as UpdateRequest;
    const admin = createAdminClient();
    const ownerClient = createUserScopedClient(authorization);

    if (!ownerClient) throw new Error("UNAUTHENTICATED");

    if (body.action === "registration") {
      const { error } = await ownerClient.rpc("owner_set_registration_enabled", {
        new_registration_enabled: Boolean(body.registration_enabled),
      });
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (
      body.action !== "update_user" ||
      !body.user_id ||
      !["owner", "admin", "user"].includes(body.role) ||
      !["pending", "active", "disabled", "rejected"].includes(body.account_status)
    ) {
      return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    }

    if (body.user_id === owner.user.id && (body.role !== "owner" || body.account_status !== "active")) {
      return NextResponse.json(
        { error: "The active owner cannot demote or disable their own account." },
        { status: 400 }
      );
    }

    const { error } = await ownerClient.rpc("owner_update_user_access", {
      target_user_id: body.user_id,
      new_role: body.role,
      new_account_status: body.account_status,
    });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("admin users PATCH error", error);
    return NextResponse.json(
      { error: "User management could not be updated." },
      { status: accessError(error) }
    );
  }
}
