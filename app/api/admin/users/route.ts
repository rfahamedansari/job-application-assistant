import { NextRequest, NextResponse } from "next/server";

import {
  createAdminClient,
  createUserScopedClient,
  describeAccessError,
  requireOwner,
} from "@/lib/serverAuth";

type OwnerProfile = {
  id: string;
  full_name: string | null;
  role: string;
  account_status: string;
  approved_at: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    try {
      await requireOwner(authHeader);
    } catch (error) {
      const accessError = describeAccessError(error);

      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    const userClient = createUserScopedClient(authHeader);

    if (!userClient) {
      return NextResponse.json(
        { error: "Invalid authentication session." },
        { status: 401 }
      );
    }

    const {
      data: profiles,
      error: profilesError,
    } = await userClient.rpc("owner_list_profiles");

    if (profilesError) {
      console.error(
        "admin/users owner_list_profiles error:",
        profilesError
      );

      return NextResponse.json(
        { error: profilesError.message },
        { status: 500 }
      );
    }

    const admin = createAdminClient();

    const {
      data: authUsersData,
      error: authUsersError,
    } = await admin.auth.admin.listUsers();

    if (authUsersError) {
      console.error(
        "admin/users auth users error:",
        authUsersError
      );

      return NextResponse.json(
        { error: authUsersError.message },
        { status: 500 }
      );
    }

    const emailById = new Map(
      authUsersData.users.map((user) => [
        user.id,
        user.email ?? "",
      ])
    );

    const users = (
      (profiles ?? []) as OwnerProfile[]
    ).map((profile) => ({
      ...profile,
      email: emailById.get(profile.id) ?? "",
    }));

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("admin/users unexpected error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error loading users.",
      },
      { status: 500 }
    );
  }
}
