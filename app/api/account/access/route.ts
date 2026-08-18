import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserScopedClient } from "@/lib/serverAuth";

export async function GET(request: NextRequest) {
  const supabase = createUserScopedClient(request.headers.get("authorization"));

  if (!supabase) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name,role,account_status")
    .eq("id", user.id)
    .single();

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && user.email?.toLowerCase() === ownerEmail) {
    try {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const { data: ownerProfile, error: ownerError } = await admin
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: profile?.full_name ?? user.user_metadata.full_name ?? "Owner",
          role: "owner",
          account_status: "active",
          approved_at: now,
          approved_by: user.id,
          updated_at: now,
        })
        .select("full_name,role,account_status")
        .single();
      if (ownerError) throw ownerError;
      profile = ownerProfile;
      error = null;
    } catch (ownerBootstrapError) {
      console.error("owner bootstrap error", ownerBootstrapError);
    }
  }

  if (error || !profile) {
    return NextResponse.json(
      { error: "Access profile is missing." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    email: user.email,
    full_name: profile.full_name,
    role: profile.role,
    account_status: profile.account_status,
  });
}
