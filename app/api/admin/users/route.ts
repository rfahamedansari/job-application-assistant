import { NextRequest, NextResponse } from "next/server";

import {
  createAdminClient,
  createUserScopedClient,
  describeAccessError,
  requireOwner,
} from "@/lib/serverAuth";

type AccountStatus = "active" | "disabled" | "rejected";

type UpdateUserRequest = {
  user_id?: string;
  account_status?: AccountStatus;
};

type OwnerProfile = {
  id: string;
  full_name: string | null;
  role: string;
  account_status: string;
  approved_at: string | null;
  updated_at: string;
};

const ALLOWED_STATUSES = new Set<AccountStatus>([
  "active",
  "disabled",
  "rejected",
]);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    let owner;

    try {
      owner = await requireOwner(authHeader);
    } catch (error) {
      const accessError = describeAccessError(error);

      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    let body: UpdateUserRequest;

    try {
      body = (await request.json()) as UpdateUserRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const targetUserId = body.user_id?.trim();
    const accountStatus = body.account_status;

    if (!targetUserId) {
      return NextResponse.json(
        { error: "user_id is required." },
        { status: 400 }
      );
    }

    if (!accountStatus || !ALLOWED_STATUSES.has(accountStatus)) {
      return NextResponse.json(
        {
          error:
            "account_status must be one of: active, disabled, rejected.",
        },
        { status: 400 }
      );
    }

    if (
      targetUserId === owner.user.id &&
      accountStatus !== "active"
    ) {
      return NextResponse.json(
        {
          error:
            "You cannot disable or reject your own Owner account.",
        },
        { status: 400 }
      );
    }

    const userClient = createUserScopedClient(authHeader);

    if (!userClient) {
      return NextResponse.json(
        { error: "Invalid authentication session." },
        { status: 401 }
      );
    }

    /*
     * Get all profiles through the existing Owner-only
     * SECURITY DEFINER database function.
     */
    const {
      data: profiles,
      error: profilesError,
    } = await userClient.rpc("owner_list_profiles");

    if (profilesError) {
      console.error(
        "admin/approve-user owner_list_profiles error:",
        profilesError
      );

      return NextResponse.json(
        { error: profilesError.message },
        { status: 500 }
      );
    }

    const targetProfile = (
      (profiles ?? []) as OwnerProfile[]
    ).find((profile) => profile.id === targetUserId);

    if (!targetProfile) {
      return NextResponse.json(
        { error: "The requested account was not found." },
        { status: 404 }
      );
    }

    /*
     * Never modify another Owner account through this workflow.
     */
    if (targetProfile.role === "owner") {
      return NextResponse.json(
        {
          error:
            "Owner accounts cannot be modified through user approval.",
        },
        { status: 400 }
      );
    }

    /*
     * Use the existing Owner-only database function to update
     * the user's role and account status.
     */
    const { error: updateError } =
      await userClient.rpc(
        "owner_update_user_access",
        {
          target_user_id: targetUserId,
          new_role: targetProfile.role,
          new_account_status: accountStatus,
        }
      );

    if (updateError) {
      console.error(
        "admin/approve-user owner_update_user_access error:",
        updateError
      );

      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        accountStatus === "active"
          ? "User approved successfully."
          : `User account changed to ${accountStatus}.`,
    });
  } catch (error) {
    console.error(
      "admin/approve-user unexpected error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error updating user.",
      },
      { status: 500 }
    );
  }
}
