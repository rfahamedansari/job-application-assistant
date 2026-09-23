import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, describeAccessError, requireActiveUser } from "@/lib/serverAuth";

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
    let access;
    try {
      access = await requireActiveUser(request.headers.get("authorization"));
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as IngestPayload;
    const title = body.title?.trim();
    const company = body.company?.trim();

    if (!title) return NextResponse.json({ error: "Job title is required." }, { status: 400 });
    if (!company) return NextResponse.json({ error: "Company is required." }, { status: 400 });

    // This route has already authenticated and authorized the user.
    // Use the server-only service-role client for the INSERT so the save
    // cannot be blocked by the user's browser RLS session. We still write
    // created_by = the authenticated user's ID, so ownership remains intact.
    const admin = createAdminClient();

    const { data: insertedJob, error } = await admin
      .from("jobs")
      .insert({
        created_by: access.user.id,
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
        source_type: body.source_type ?? "formal_job",
        application_method: body.application_method ?? (body.contact_email ? "email" : "website"),
        contact_email: body.contact_email?.trim() || null,
        recruiter_name: body.recruiter_name?.trim() || null,
        source_post_text: body.source_post_text?.trim() || null,
        external_id: body.external_id?.trim() || null,
        agent_status: "ingested",
        agent_notes: body.agent_notes?.trim() || null,
        discovered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("ingest-job database error:", error);
      return NextResponse.json({ error: `Database save failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, job: insertedJob });
  } catch (error) {
    console.error("ingest-job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected ingestion error." },
      { status: 500 }
    );
  }
}
