import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/serverAuth";

type RegisterRequest = {
  full_name?: string;
  email?: string;
  password?: string;
};

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("registration_settings")
      .select("registration_enabled")
      .eq("id", true)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ registration_enabled: data.registration_enabled });
  } catch (error) {
    console.error("registration status error", error);
    return NextResponse.json(
      { registration_enabled: false, error: "Registration is unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterRequest;
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!fullName || !email || password.length < 8) {
      return NextResponse.json(
        { error: "Full name, valid email and an 8-character password are required." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin
      .from("registration_settings")
      .select("registration_enabled")
      .eq("id", true)
      .single();

    if (settingsError || !settings?.registration_enabled) {
      return NextResponse.json(
        { error: "New-user registration is currently closed." },
        { status: 403 }
      );
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Account could not be created." },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      full_name: fullName,
      role: "user",
      account_status: "pending",
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Registration received. Your account is pending owner approval.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("registration error", error);
    return NextResponse.json(
      { error: "Registration could not be completed." },
      { status: 500 }
    );
  }
}

