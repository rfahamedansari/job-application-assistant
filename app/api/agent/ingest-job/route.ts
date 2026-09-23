import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type IngestPayload = {
  title?: string;
  company?: string;
  location?: string;
  country?: string;
  category?: string;
  source?: string;
  job_url?: string;
  job_description?: string;
  employment_type?: string;
  salary_text?: string;
  posted_at?: string;

  source_type?: "formal_job" | "recruiter_post";
  application_method?: "website" | "email" | "manual";
  contact_email?: string;
  recruiter_name?: string;
  source_post_text?: string;
  external_id?: string;
  agent_notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IngestPayload;

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
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
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

    const title = body.title?.trim();
    const company = body.company?.trim();

    if (!title) {
      return NextResponse.json(
        { error: "Job title is required." },
        { status: 400 }
      );
    }

    if (!company) {
      return NextResponse.json(
        { error: "Company is required." },
        { status: 400 }
      );
    }

    const sourceType = body.source_type ?? "formal_job";
    const applicationMethod =
      body.application_method ??
      (body.contact_email ? "email" : "website");

    // Use select() rather than select().single().
    // The INSERT and SELECT RLS policies are separate checks. If a future
    // policy change allows the insert but restricts the read-back, .single()
    // can make a successful insert look like a failed save.
    const insertResult = await supabase
      .from("jobs")
      .insert({
        created_by: user.id,
        title,
        company,
        location: body.location?.trim() || null,
        country: body.country?.trim() || null,
        category: body.category?.trim() || "General",
        source: body.source?.trim() || "Agent",
        job_url: body.job_url?.trim() || "",
        job_description: body.job_description?.trim() || null,
        employment_type: body.employment_type?.trim() || null,
        salary_text: body.salary_text?.trim() || null,
        posted_at: body.posted_at || null,
        source_type: sourceType,
        application_method: applicationMethod,
        contact_email: body.contact_email?.trim() || null,
        recruiter_name: body.recruiter_name?.trim() || null,
        source_post_text: body.source_post_text?.trim() || null,
        external_id: body.external_id?.trim() || null,
        agent_status: "ingested",
        agent_notes: body.agent_notes?.trim() || null,
        discovered_at: new Date().toISOString(),
      })
      .select();

    const insertedJob = insertResult.data?.[0] ?? null;
    const error = insertResult.error;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!insertedJob) {
      return NextResponse.json(
        {
          error:
            "The job was saved, but could not be read back because of a database permissions (RLS) mismatch on the jobs table. Please refresh the Jobs list.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job: insertedJob,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected ingestion error.",
      },
      { status: 500 }
    );
  }
}
