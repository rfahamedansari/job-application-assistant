import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

type MatchRequest = {
  job_id?: string;
  resume_id?: string;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

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

    const body = (await request.json()) as MatchRequest;

    const jobId = body.job_id?.trim();
    const resumeId = body.resume_id?.trim();

    if (!jobId || !resumeId) {
      return NextResponse.json(
        { error: "job_id and resume_id are required." },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        `
          id,
          title,
          company,
          location,
          country,
          category,
          job_description,
          employment_type,
          source_type,
          application_method
        `
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? "Job not found." },
        { status: 404 }
      );
    }

    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select(
        `
          id,
          user_id,
          name,
          category,
          resume_text,
          parsing_status
        `
      )
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (resumeError || !resume) {
      return NextResponse.json(
        { error: resumeError?.message ?? "Resume not found." },
        { status: 404 }
      );
    }

    if (
      resume.parsing_status !== "completed" ||
      !resume.resume_text?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "This resume has not been parsed yet. Parse the resume first.",
        },
        { status: 400 }
      );
    }

    if (!job.job_description?.trim()) {
      return NextResponse.json(
        {
          error:
            "This job does not contain enough job-description text for AI matching.",
        },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: [
        {
          role: "system",
          content: `
You are an ATS and job-to-resume matching analyst.

Compare one job description with one real resume.

Important rules:
- Use only evidence from the supplied job description and resume.
- Never invent skills, certifications, achievements, projects, tools, employers, or experience.
- Do not treat a skill as missing if it is clearly present anywhere in the resume.
- Be conservative and consistent.
- The score is an ATS-style analytical estimate, not a guarantee of recruiter ATS results.

Score out of 100 using these weighted areas:
- Required skills and keywords: 35
- Relevant experience/responsibilities: 25
- Role/domain alignment: 15
- Certifications/tools: 10
- Seniority/years-of-experience alignment: 10
- ATS/readability relevance: 5

Return valid JSON only.

Required JSON structure:

{
  "overall_score": 0,
  "level": "High Match",
  "matched_skills": [],
  "missing_skills": [],
  "matched_certifications": [],
  "missing_certifications": [],
  "matched_keywords": [],
  "missing_keywords": [],
  "strengths": [],
  "gaps": [],
  "experience_alignment": "",
  "role_alignment": "",
  "ats_notes": [],
  "tailoring_recommendations": [],
  "summary": ""
}

Rules for level:
- 75 to 100 = "High Match"
- 50 to 74 = "Medium Match"
- 0 to 49 = "Low Match"

Tailoring recommendations must only suggest truthful reframing,
reordering, emphasis, or keyword alignment based on experience that
already exists in the resume.
          `.trim(),
        },

        {
          role: "user",
          content: `
JOB TITLE:
${job.title}

COMPANY:
${job.company}

CATEGORY:
${job.category ?? ""}

LOCATION:
${[job.location, job.country].filter(Boolean).join(", ")}

EMPLOYMENT TYPE:
${job.employment_type ?? ""}

JOB DESCRIPTION:
${job.job_description}

RESUME NAME:
${resume.name}

RESUME CATEGORY:
${resume.category}

RESUME TEXT:
${resume.resume_text}
          `.trim(),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        { error: "AI returned no match analysis." },
        { status: 500 }
      );
    }

    let analysis;

    try {
      const cleaned = outputText
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/, "")
        .trim();

      analysis = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        {
          error: "AI response could not be parsed as JSON.",
          raw_response: outputText,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      match: {
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        resume_id: resume.id,
        resume_name: resume.name,
        ...analysis,
      },
    });
  } catch (error) {
    console.error("match-job error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected resume matching error.",
      },
      { status: 500 }
    );
  }
}