import { NextRequest, NextResponse } from "next/server";
import {
  createAdminClient,
  describeAccessError,
  requireOwner,
} from "@/lib/serverAuth";

type AccountStatus = "active" | "disabled" | "rejected";

type UpdateUserRequest = {
  user_id?: string;
  account_status?: AccountStatus;
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

    // The Owner account can never be disabled or rejected.
    if (targetUserId === owner.user.id && accountStatus !== "active") {
      return NextResponse.json(
        {
          error:
            "You cannot disable or reject your own Owner account.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verify that the target profile exists before attempting the update.
    const { data: targetProfile, error: lookupError } = await admin
      .from("profiles")
      .select("id, role, account_status")
      .eq("id", targetUserId)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("admin/approve-user profile lookup error:", lookupError);

      return NextResponse.json(
        { error: "Could not verify the target account." },
        { status: 500 }
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: "The requested account was not found." },
        { status: 404 }
      );
    }

    // Never allow an Owner account to be modified through this workflow.
    if (targetProfile.role === "owner") {
      return NextResponse.json(
        {
          error:
            "Owner accounts cannot be modified through user approval.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: updatedProfile, error: updateError } = await admin
      .from("profiles")
      .update({
        account_status: accountStatus,
        approved_at:
          accountStatus === "active" ? now : null,
        approved_by:
          accountStatus === "active" ? owner.user.id : null,
        updated_at: now,
      })
      .eq("id", targetUserId)
      .select("id, account_status, approved_at, approved_by")
      .limit(1)
      .maybeSingle();

    if (updateError) {
      console.error("admin/approve-user update error:", updateError);

      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedProfile) {
      return NextResponse.json(
        { error: "The account status could not be updated." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        accountStatus === "active"
          ? "User approved successfully."
          : `User account changed to ${accountStatus}.`,
      user: updatedProfile,
    });
  } catch (error) {
    console.error("admin/approve-user unexpected error:", error);

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
