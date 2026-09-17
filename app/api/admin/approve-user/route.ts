import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, describeAccessError, requireOwner } from "@/lib/serverAuth";

type UpdateUserRequest = {
  user_id?: string;
  account_status?: "active" | "disabled" | "rejected";
};

const ALLOWED_STATUSES = new Set(["active", "disabled", "rejected"]);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    let owner;
    try {
      owner = await requireOwner(authHeader);
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as UpdateUserRequest;
    const targetUserId = body.user_id?.trim();
    const accountStatus = body.account_status;

    if (!targetUserId) {
      return NextResponse.json({ error: "user_id is required." }, { status: 400 });
    }

    if (!accountStatus || !ALLOWED_STATUSES.has(accountStatus)) {
      return NextResponse.json(
        { error: "account_status must be one of: active, disabled, rejected." },
        { status: 400 }
      );
    }

    if (targetUserId === owner.user.id && accountStatus !== "active") {
      return NextResponse.json(
        { error: "You cannot disable or reject your own Owner account." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        account_status: accountStatus,
        approved_at: accountStatus === "active" ? new Date().toISOString() : null,
        approved_by: accountStatus === "active" ? owner.user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("admin/approve-user error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error updating user." },
      { status: 500 }
    );
  }
}
