import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

type TailorResumeRequest = {
  application_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

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
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let user;
    try {
      ({ user } = await requireActiveUser(authHeader));
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as TailorResumeRequest;
    const applicationId = body.application_id?.trim();

    if (!applicationId) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    // TEMPORARY DIAGNOSTIC LOGGING — remove after root cause is found.
    console.log("[tailor-resume-debug] user.id:", user.id);
    console.log("[tailor-resume-debug] applicationId received:", JSON.stringify(applicationId));

    // Do not use .single() here. Supabase returns the same coercion error for
    // both zero rows and duplicate legacy rows, which hides the real problem
    // from the review workflow. Limit the result and handle an empty array
    // explicitly instead.
    const applicationResult = await supabase
      .from("applications")
      .select("id, user_id, job_id, resume_id, role, company")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .limit(1);

    console.log("[tailor-resume-debug] query result data:", JSON.stringify(applicationResult.data));
    console.log("[tailor-resume-debug] query result error:", JSON.stringify(applicationResult.error));

    const application = applicationResult.data?.[0] ?? null;
    const applicationError = applicationResult.error;

    if (applicationError || !application) {
      return NextResponse.json(
        { error: applicationError?.message ?? "Application not found." },
        { status: 404 }
      );
    }

    if (!application.job_id) {
      return NextResponse.json(
        {
          error:
            "This application is not linked to a saved job. Add or link the job description before tailoring.",
        },
        { status: 400 }
      );
    }

    const jobResult = await supabase
      .from("jobs")
      .select("id, title, company, job_description")
      .eq("id", application.job_id)
      .limit(1);

    const job = jobResult.data?.[0] ?? null;
    const jobError = jobResult.error;

    if (jobError || !job) {
      return NextResponse.json(
        {
          error:
            jobError?.message ??
            "The linked job record is unavailable. Return to Daily Jobs, open the original vacancy, and save it for review again.",
        },
        { status: 404 }
      );
    }

    if (!job.job_description?.trim()) {
      return NextResponse.json(
        {
          error:
            "This job has no job description. Add the description before tailoring the resume.",
        },
        { status: 400 }
      );
    }

    const resumeFields =
      "id, name, category, resume_text, parsing_status, is_primary";
    let resume = null;
    let resumeError = null;

    if (application.resume_id) {
      const selectedResumeResult = await supabase
        .from("resumes")
        .select(resumeFields)
        .eq("user_id", user.id)
        .eq("id", application.resume_id)
        .eq("parsing_status", "completed")
        .limit(1);

      resume = selectedResumeResult.data?.[0] ?? null;
      resumeError = selectedResumeResult.error;
    }

    // A saved application can reference an older or unparsed resume. In that
    // case, use the user's primary parsed resume, then any parsed resume, so
    // the approval workflow does not become permanently stuck.
    if (!resume?.resume_text?.trim()) {
      const fallbackResumeResult = await supabase
        .from("resumes")
        .select(resumeFields)
        .eq("user_id", user.id)
        .eq("parsing_status", "completed")
        .order("is_primary", { ascending: false })
        .limit(1);

      resume = fallbackResumeResult.data?.[0] ?? null;
      resumeError = fallbackResumeResult.error;
    }

    if (resumeError || !resume?.resume_text?.trim()) {
      return NextResponse.json(
        {
          error:
            resumeError?.message ??
            "No parsed resume is available. Open Resume Library and parse the selected or primary resume first.",
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: `
You are the Resume Tailoring Agent for Ahamed AI Career OS.

Compare the supplied real resume with the supplied real job description and prepare a truthful ATS-friendly tailored resume draft.

Mandatory safeguards:
- Use only facts explicitly present in the source resume.
- Never invent or assume skills, certifications, projects, employers, job titles, dates, tools, achievements, metrics, responsibilities, or years of experience.
- Do not change factual dates, employer names, qualifications, or certifications.
- A job requirement absent from the resume must be listed as a gap, never added to the tailored resume.
- Improve wording, ordering, clarity, and relevant keyword emphasis only when supported by the source resume.
- Preserve useful contact details and employment history from the source.
- The ATS score is an analytical estimate, not a hiring guarantee.
- Return valid JSON only, without markdown fences.

Required JSON format:
{
  "ats_score": 0,
  "summary": "",
  "matched_keywords": [],
  "missing_keywords": [],
  "recommended_changes": [],
  "truth_check": "",
  "tailored_resume": ""
}
          `.trim(),
        },
        {
          role: "user",
          content: `
JOB TITLE:
${job.title ?? application.role}

COMPANY:
${job.company ?? application.company}

JOB DESCRIPTION:
${job.job_description.slice(0, 30000)}

========================================

SOURCE RESUME NAME:
${resume.name}

SOURCE RESUME CATEGORY:
${resume.category ?? ""}

SOURCE RESUME:
${resume.resume_text.slice(0, 50000)}
          `.trim(),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        { error: "AI returned no resume-tailoring analysis." },
        { status: 500 }
      );
    }

    let tailoring;

    try {
      tailoring = JSON.parse(
        outputText
          .replace(/^```json/i, "")
          .replace(/^```/i, "")
          .replace(/```$/, "")
          .trim()
      );
    } catch {
      return NextResponse.json(
        { error: "AI response could not be parsed as JSON." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        title: job.title ?? application.role,
        company: job.company ?? application.company,
      },
      source_resume: {
        id: resume.id,
        name: resume.name,
        category: resume.category ?? "",
      },
      tailoring: {
        ats_score: Math.max(
          0,
          Math.min(100, Number(tailoring.ats_score) || 0)
        ),
        summary: String(tailoring.summary ?? ""),
        matched_keywords: Array.isArray(tailoring.matched_keywords)
          ? tailoring.matched_keywords.map(String)
          : [],
        missing_keywords: Array.isArray(tailoring.missing_keywords)
          ? tailoring.missing_keywords.map(String)
          : [],
        recommended_changes: Array.isArray(tailoring.recommended_changes)
          ? tailoring.recommended_changes.map(String)
          : [],
        truth_check: String(tailoring.truth_check ?? ""),
        tailored_resume: String(tailoring.tailored_resume ?? ""),
      },
    });
  } catch (error) {
    console.error("tailor-resume error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected resume-tailoring error.",
      },
      { status: 500 }
    );
  }
}
