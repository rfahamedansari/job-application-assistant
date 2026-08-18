import { NextRequest, NextResponse } from "next/server";
import {
  AccountRole,
  AccountStatus,
  createAdminClient,
  requireOwner,
} from "@/lib/serverAuth";

function accessError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return 401;
  if (message === "FORBIDDEN") return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request.headers.get("authorization"));
    const admin = createAdminClient();

    const [{ data: authData, error: authError }, { data: profiles, error: profileError }, { data: settings, error: settingsError }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        admin
          .from("profiles")
          .select("id,full_name,role,account_status,approved_at,updated_at"),
        admin
          .from("registration_settings")
          .select("registration_enabled")
          .eq("id", true)
          .single(),
      ]);

    if (authError || profileError || settingsError) {
      throw authError ?? profileError ?? settingsError;
    }

    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const users = authData.users.map((user) => ({
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      ...profilesById.get(user.id),
    }));

    return NextResponse.json({
      users,
      registration_enabled: settings.registration_enabled,
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
    const owner = await requireOwner(request.headers.get("authorization"));
    const body = (await request.json()) as UpdateRequest;
    const admin = createAdminClient();

    if (body.action === "registration") {
      const { error } = await admin.from("registration_settings").upsert({
        id: true,
        registration_enabled: Boolean(body.registration_enabled),
        updated_at: new Date().toISOString(),
        updated_by: owner.user.id,
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

    const now = new Date().toISOString();
    const { error } = await admin
      .from("profiles")
      .update({
        role: body.role,
        account_status: body.account_status,
        approved_at: body.account_status === "active" ? now : null,
        approved_by: body.account_status === "active" ? owner.user.id : null,
        updated_at: now,
      })
      .eq("id", body.user_id);

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

