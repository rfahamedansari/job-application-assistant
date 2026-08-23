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

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error: "Supabase environment variables are missing.",
        },
        { status: 500 }
      );
    }

    const authHeader =
      request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Missing authentication token.",
        },
        { status: 401 }
      );
    }

    /*
      IMPORTANT:
      Pass the user's Bearer token into the Supabase client.

      This makes database operations run as the
      authenticated user instead of the anonymous role.
    */
    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Invalid or expired session.",
        },
        { status: 401 }
      );
    }

    const title = body.title?.trim();
    const company = body.company?.trim();

    if (!title) {
      return NextResponse.json(
        {
          error: "Job title is required.",
        },
        { status: 400 }
      );
    }

    if (!company) {
      return NextResponse.json(
        {
          error: "Company is required.",
        },
        { status: 400 }
      );
    }

    const sourceType =
      body.source_type ?? "formal_job";

    const applicationMethod =
      body.application_method ??
      (body.contact_email ? "email" : "website");

    // Do not chain .single() onto the insert. Postgres RLS evaluates the
    // RETURNING clause against the SELECT policy separately from the
    // INSERT/WITH CHECK policy. If those two policies are not perfectly
    // symmetric, the row can be committed successfully while the
    // read-back returns zero rows — which .single() reports as a
    // "cannot coerce" error, making a successful save look like a
    // failure. Use .select() (array) and handle 0 rows explicitly so a
    // real insert failure is never confused with a read-back mismatch.
    const insertResult = await supabase
      .from("jobs")
      .insert({
        created_by: user.id,

        title,
        company,

        location:
          body.location?.trim() || null,

        country:
          body.country?.trim() || null,

        category:
          body.category?.trim() || "General",

        source:
          body.source?.trim() || "Agent",

        job_url:
          body.job_url?.trim() || "",

        job_description:
          body.job_description?.trim() || null,

        employment_type:
          body.employment_type?.trim() || null,

        salary_text:
          body.salary_text?.trim() || null,

        posted_at:
          body.posted_at || null,

        source_type: sourceType,

        application_method:
          applicationMethod,

        contact_email:
          body.contact_email?.trim() || null,

        recruiter_name:
          body.recruiter_name?.trim() || null,

        source_post_text:
          body.source_post_text?.trim() || null,

        external_id:
          body.external_id?.trim() || null,

        agent_status: "ingested",

        agent_notes:
          body.agent_notes?.trim() || null,

        discovered_at:
          new Date().toISOString(),
      })
      .select();

    const insertedJob = insertResult.data?.[0] ?? null;
    const error = insertResult.error;

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (!insertedJob) {
      // The insert reported no error, so the row was committed, but the
      // read-back returned nothing. This means the jobs SELECT policy is
      // narrower than the INSERT policy in the database. Tell the caller
      // the truth instead of a false success or a confusing crash, and
      // point at the real fix (the RLS migration), rather than silently
      // pretending nothing happened.
      return NextResponse.json(
        {
          error:
            "The job was saved, but could not be read back due to a database permissions (RLS) mismatch between insert and select policies on the jobs table. Run the provided SQL migration to fix this, then refresh the Jobs list.",
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