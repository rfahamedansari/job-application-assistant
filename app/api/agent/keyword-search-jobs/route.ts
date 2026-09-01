import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { collectJobs } from "@/lib/jobSources";

// Pure keyword search — deliberately independent of the user's profile or
// resume. Unlike /api/agent/collect-jobs, this does NOT blend in the
// profile's related target_roles, and does NOT compute a match score
// against any resume. It searches exactly the phrase the user typed,
// across every configured source, and returns the raw results with no
// ranking applied.

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      query?: unknown;
      include_saudi?: unknown;
      uae_pages?: unknown;
    };

    const query =
      typeof body.query === "string"
        ? body.query.trim().replace(/\s+/g, " ").slice(0, 80)
        : "";

    if (!query) {
      return NextResponse.json(
        { error: "Enter a keyword to search." },
        { status: 400 }
      );
    }

    const requestedUaePages =
      typeof body.uae_pages === "number" ? body.uae_pages : 6;
    const uaePages = Math.min(6, Math.max(1, Math.trunc(requestedUaePages) || 6));
    const secondaryCountries: Array<"Saudi Arabia"> =
      body.include_saudi === true ? ["Saudi Arabia"] : [];

    // Single exact query, no profile roles blended in.
    const collected = await collectJobs([query], uaePages, secondaryCountries);

    return NextResponse.json({
      success: true,
      query,
      jobs: collected.jobs,
      warnings: collected.warnings,
    });
  } catch (error) {
    console.error("keyword-search-jobs error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while searching jobs.",
      },
      { status: 500 }
    );
  }
}
