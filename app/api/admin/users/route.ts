import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, describeAccessError, requireOwner } from "@/lib/serverAuth";

// Owner-only. Lists every profile so the Owner can see who's pending,
// active, or disabled. Uses the service-role client because RLS correctly
// prevents ordinary users from reading other people's profile rows — this
// route is the deliberate, access-controlled exception to that, gated by
// requireOwner rather than by relying on RLS to make the decision.

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    try {
      await requireOwner(authHeader);
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const admin = createAdminClient();

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name, role, account_status, approved_at, updated_at")
      .order("updated_at", { ascending: false });

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    // Profiles don't store email — pull it from auth.users via the admin
    // client so the Owner can actually identify who each pending row is.
    const { data: authUsersData, error: authUsersError } = await admin.auth.admin.listUsers();

    if (authUsersError) {
      return NextResponse.json({ error: authUsersError.message }, { status: 500 });
    }

    const emailById = new Map(authUsersData.users.map((u) => [u.id, u.email ?? ""]));

    const users = (profiles ?? []).map((profile) => ({
      ...profile,
      email: emailById.get(profile.id) ?? "",
    }));

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("admin/users error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error loading users." },
      { status: 500 }
    );
  }
}
