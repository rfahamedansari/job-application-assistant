import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

// Generates a starting draft for interview prep — likely technical topics,
// HR-style questions, STAR-format talking points, and questions to ask the
// interviewer — grounded in the actual saved job description and the
// candidate's real resume. The output pre-fills the existing manual form;
// nothing is saved automatically and the person can edit anything before
// saving, same review-before-commit pattern as the rest of the app.
//
// Truthfulness note: generating plausible interview QUESTIONS an employer
// might ask is safe to do freely — that's predicting employer behavior, not
// claiming facts about the candidate. STAR examples are different: those
// describe the CANDIDATE's own achievements, so they must be grounded only
// in what the resume actually says, exactly like resume tailoring.

type GenerateRequest = {
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
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
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

    const body = (await request.json()) as GenerateRequest;
    const applicationId = body.application_id?.trim();

    if (!applicationId) {
      return NextResponse.json(
        { error: "Select an application first — the job description is needed to generate prep content." },
        { status: 400 }
      );
    }

    const applicationResult = await supabase
      .from("applications")
      .select("id, user_id, job_id, role, company")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .limit(1);

    const application = applicationResult.data?.[0] ?? null;

    if (applicationResult.error || !application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    let jobDescription = "";
    let jobTitle = application.role;
    let jobCompany = application.company;

    if (application.job_id) {
      const jobResult = await supabase
        .from("jobs")
        .select("title, company, job_description")
        .eq("id", application.job_id)
        .limit(1);

      const job = jobResult.data?.[0] ?? null;
      if (job) {
        jobDescription = job.job_description ?? "";
        jobTitle = job.title ?? jobTitle;
        jobCompany = job.company ?? jobCompany;
      }
    }

    if (!jobDescription.trim()) {
      return NextResponse.json(
        {
          error:
            "This application has no saved job description, so specific prep content can't be generated. General role-based questions still need a description to ground the technical topics — add the job description to this job first.",
        },
        { status: 400 }
      );
    }

    const resumeResult = await supabase
      .from("resumes")
      .select("name, category, resume_text")
      .eq("user_id", user.id)
      .eq("parsing_status", "completed")
      .order("is_primary", { ascending: false })
      .limit(1);

    const resume = resumeResult.data?.[0] ?? null;

    if (!resume?.resume_text?.trim()) {
      return NextResponse.json(
        {
          error: "No parsed resume is available. Open Resume Library and parse a resume first — STAR examples need your real experience to draw from.",
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
You are the Interview Preparation Agent for Ahamed AI Career OS.

Given a real job description and the candidate's real resume, prepare interview
preparation content across four areas. This is a starting draft for the
candidate to review and edit — not a final script.

CRITICAL DISTINCTION between the four sections:

1. "technical_topics" and "hr_questions" — these predict what an INTERVIEWER
   might ask, based on the job description's requirements. It is fine and
   expected to generate plausible, realistic questions here even though you
   are not quoting a real interviewer — this is standard interview-prep
   practice, not a truth claim about the candidate.

2. "star_examples" — these describe the CANDIDATE'S OWN achievements in
   STAR format (Situation, Task, Action, Result). This section must be
   grounded ONLY in what the resume actually says. Never invent a project,
   metric, employer, or outcome the candidate did not actually have. If the
   resume lacks a clear example for a likely question, say so explicitly
   rather than fabricating one — e.g. "Your resume doesn't show a clear
   example for [topic] — consider preparing one from your actual experience
   at [real employer]." Prefer drawing on real, specific achievements
   already in the resume, framed for this job's requirements.

3. "questions_to_ask" — thoughtful questions the CANDIDATE could ask the
   interviewer, grounded in genuine aspects of the job description (not
   generic filler).

Format each section as a single string with one item per line, prefixed
with "- ". Keep each item concise (one line, not a paragraph). Provide
5-8 items in technical_topics, 5-8 in hr_questions, 4-6 in star_examples,
and 4-6 in questions_to_ask.

Return valid JSON only, with no markdown fences and no text before or
after the JSON object, in this exact shape:

{
  "technical_topics": "",
  "hr_questions": "",
  "star_examples": "",
  "questions_to_ask": ""
}
          `.trim(),
        },
        {
          role: "user",
          content: `
JOB TITLE:
${jobTitle}

COMPANY:
${jobCompany}

JOB DESCRIPTION:
${jobDescription.slice(0, 20000)}

========================================

CANDIDATE RESUME NAME:
${resume.name}

CANDIDATE RESUME CATEGORY:
${resume.category ?? ""}

CANDIDATE RESUME:
${resume.resume_text.slice(0, 40000)}
          `.trim(),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        { error: "AI returned no interview-prep content." },
        { status: 500 }
      );
    }

    let generated: Record<string, unknown>;

    try {
      generated = JSON.parse(
        outputText.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/, "").trim()
      );
    } catch {
      const firstBrace = outputText.indexOf("{");
      const lastBrace = outputText.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace <= firstBrace) {
        return NextResponse.json(
          { error: "AI response could not be parsed as JSON. Try again." },
          { status: 500 }
        );
      }
      try {
        generated = JSON.parse(outputText.slice(firstBrace, lastBrace + 1));
      } catch {
        return NextResponse.json(
          { error: "AI response could not be parsed as JSON. Try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      technical_topics: String(generated.technical_topics ?? ""),
      hr_questions: String(generated.hr_questions ?? ""),
      star_examples: String(generated.star_examples ?? ""),
      questions_to_ask: String(generated.questions_to_ask ?? ""),
    });
  } catch (error) {
    console.error("generate-interview-prep error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error while generating prep content." },
      { status: 500 }
    );
  }
}
