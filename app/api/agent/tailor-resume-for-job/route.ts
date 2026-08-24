import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

// Quick-tailor for a job the user hasn't saved as an Application yet — used
// by the "Tailor & Download" button directly on job cards in Daily Jobs.
// Unlike /api/agent/tailor-resume, this takes the job's details straight
// from the request body instead of looking up a saved application/job
// record, so it works on freshly-collected search results too. Nothing is
// saved to the database by this route — it's purely generate-and-return,
// same truthfulness rules as the full tailor-resume route.

type TailorForJobRequest = {
  title?: string;
  company?: string;
  job_description?: string;
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
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let user;
    try {
      ({ user } = await requireActiveUser(authHeader));
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as TailorForJobRequest;
    const title = body.title?.trim();
    const company = body.company?.trim();
    const jobDescription = body.job_description?.trim();

    if (!title) {
      return NextResponse.json(
        { error: "Job title is required." },
        { status: 400 }
      );
    }

    if (!jobDescription) {
      return NextResponse.json(
        {
          error:
            "This job has no description text available, so it cannot be tailored yet. Try Review Original Job to read the full posting first.",
        },
        { status: 400 }
      );
    }

    const resumeFields =
      "id, name, category, resume_text, parsing_status, is_primary";

    const primaryResumeResult = await supabase
      .from("resumes")
      .select(resumeFields)
      .eq("user_id", user.id)
      .eq("parsing_status", "completed")
      .order("is_primary", { ascending: false })
      .limit(1);

    const resume = primaryResumeResult.data?.[0] ?? null;
    const resumeError = primaryResumeResult.error;

    if (resumeError || !resume?.resume_text?.trim()) {
      return NextResponse.json(
        {
          error:
            resumeError?.message ??
            "No parsed resume is available. Open Resume Library and parse a resume first.",
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
- Most recent / current role: maximum 5 bullets, each bullet no more than ~18 words (roughly one line at normal resume width). Do not write 2-3 line bullets — split the idea into a shorter sentence instead.
- The next 1 most recent role: maximum 3 bullets, same ~18-word limit per bullet.
- Any role beyond that, or any role clearly less relevant to the target job (e.g. a junior/unrelated role from early career, or anything more than ~8 years old unless the target job specifically requires that exact early experience): write ONLY the company/title/dates line. No additional line, no bullets — not even one. If the role adds nothing relevant at all, omit it from the tailored resume entirely rather than listing it with no detail.
- CORE COMPETENCIES: exactly 8-10 short phrases, not more.
- KEY ACHIEVEMENTS: only include this section if it states something genuinely NOT already covered by the experience bullets above it. If every achievement you would list is a restatement of something already in the experience bullets, omit this section entirely. If included, maximum 3 items.
- TECHNICAL SKILLS: at most 4 category lines, each listing at most 6 items.
- CERTIFICATIONS: list the certifications most relevant to this specific job first; if there are more than 6 genuine certifications, keep the 6 most relevant to the target role rather than listing all of them — this is a prioritization choice for length, not an invention or omission of truth.
- COURSES COMPLETED: only include this section if it contains something not already named in Certifications. Never list the same credential (e.g. "CCNA") in both Certifications and Courses Completed — if it already appears in one, do not repeat it in the other.
- This is a hard constraint: the finished "tailored_resume" must fit on ONE page for most candidates. A second page is allowed only if, after applying every limit above, the candidate's genuinely relevant senior experience still does not fit — never produce more than two pages under any circumstances. If you are approaching the limit, cut or shorten older/less-relevant content first, not the summary or the most recent role.
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
phrases (2-6 words each), not full sentences.

PROFESSIONAL EXPERIENCE
For each role, in reverse chronological order:
  Line A: "Company Name | Location    Month YYYY - Month YYYY" (or
  "- Present" for the current role). Keep the company/location and the
  date range on this exact single line so they can be styled separately.
  Line B: Job title, on its own line directly below Line A.
  Then bullet points, each prefixed with "- ", describing responsibilities
  and quantified achievements from the source resume.

KEY ACHIEVEMENTS (optional)
Flat list of "- " bullets, no company grouping.

TECHNICAL SKILLS (optional)
One line per category: "Category Label: item, item, item" — do not use a
"- " prefix on these lines.

CERTIFICATIONS (optional)
"- " bullets, one certification per line.

COURSES COMPLETED (optional)
"- " bullets.

EDUCATION
One line per qualification: "Degree, Institution" optionally followed by
the completion date/detail if present in the source.

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
${title}

COMPANY:
${company ?? ""}

JOB DESCRIPTION:
${jobDescription.slice(0, 30000)}

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
      job: { title, company: company ?? "" },
      source_resume: {
        id: resume.id,
        name: resume.name,
        category: resume.category ?? "",
      },
      tailoring: {
        ats_score: Math.max(0, Math.min(100, Number(tailoring.ats_score) || 0)),
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
    console.error("tailor-resume-for-job error:", error);

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
