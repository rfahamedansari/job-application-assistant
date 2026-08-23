import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

type TailorResumeRequest = {
  application_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured." },
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

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: `
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
- Return valid JSON only, with no markdown fences and no text before or after the JSON object.

Length target for "tailored_resume" — these are hard limits, not suggestions:
- Most recent / current role: maximum 6 bullets, each bullet no more than ~20 words (roughly one line at normal resume width). Do not write 2-3 line bullets — split the idea into a shorter sentence instead.
- The next 1-2 most recent roles: maximum 3 bullets each, same ~20-word limit per bullet.
- Any role beyond that, or any role clearly less relevant to the target job (e.g. a junior/unrelated role from early career): compress to the company/title/dates line plus at most ONE short line of context — no bullet list for these roles at all, unless a specific achievement there is directly relevant to this job.
- CORE COMPETENCIES: exactly 9-12 short phrases, not more.
- KEY ACHIEVEMENTS: only include this section if it adds genuinely distinct information not already covered by the experience bullets. If included, maximum 4 items.
- TECHNICAL SKILLS: at most 4-5 category lines, each listing at most 6 items.
- CERTIFICATIONS: include all genuine certifications from the source, one per line, but do not add commentary.
- This is a hard constraint: the finished "tailored_resume" must fit on ONE page for most candidates. A second page is allowed only if, after applying every limit above, the candidate's genuinely relevant senior experience still does not fit — never produce more than two pages under any circumstances. If you are approaching the limit, cut or shorten older/less-relevant bullets first, not the summary or the most recent role.
- If you produce a two-page result, briefly note in "summary" why the length was necessary.

Required plain-text structure for "tailored_resume" (this is a strict layout
contract — the downstream document generator parses these exact patterns to
produce a formatted Word/PDF file, so follow the conventions precisely):

Line 1: Full name only.
Line 2: Professional title / tagline (the headline under the name).
Line 3: Contact line — phone(s), email, LinkedIn, separated by " | ".
Line 4 (optional): Nationality / visa / license line, separated by " | ", only if the source resume actually contains this.

Then a blank-line-free sequence of sections, each starting with an
ALL-CAPS heading on its own line, using only sections that have genuine
content in the source resume (never invent a section that isn't there):

PROFESSIONAL SUMMARY
A single flowing paragraph (no bullets).

CORE COMPETENCIES
List each competency phrase on its own line, prefixed with "- ". Use short
phrases (2-6 words each), not full sentences. Include 9-15 items if the
source resume supports that many; do not pad with invented skills.

PROFESSIONAL EXPERIENCE
For each role, in reverse chronological order:
  Line A: "Company Name | Location    Month YYYY - Month YYYY" (or
  "- Present" for the current role). Keep the company/location and the
  date range on this exact single line so they can be styled separately.
  Line B: Job title, on its own line directly below Line A.
  Then bullet points, each prefixed with "- ", describing responsibilities
  and quantified achievements from the source resume.

KEY ACHIEVEMENTS (optional — only if the source resume has a distinct
achievements section, otherwise omit and keep achievements inside the
relevant experience bullets)
Flat list of "- " bullets, no company grouping.

TECHNICAL SKILLS (optional — only if the source resume groups skills by
category)
One line per category: "Category Label: item, item, item" — do not use a
"- " prefix on these lines.

CERTIFICATIONS (optional — only if present in the source)
"- " bullets, one certification per line.

COURSES COMPLETED (optional — only if present in the source, separate from Certifications)
"- " bullets.

EDUCATION
One line per qualification: "Degree, Institution" optionally followed on
the same or next line by the completion date/detail if present in the
source.

Rules for this structure:
- Every fact must come from the source resume. This structural contract
  governs formatting and section order only — it never justifies adding
  content that is not genuinely present.
- Omit any section entirely (do not include an empty heading) if the
  source resume has no genuine content for it.
- Never insert blank lines between sections or between a heading and its
  content — the parser treats each non-empty line as meaningful.

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
      messages: [
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

    const outputText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

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
