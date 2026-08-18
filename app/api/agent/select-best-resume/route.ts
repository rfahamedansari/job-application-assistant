import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

type SelectBestResumeRequest = {
  job_id?: string;
};

type ResumeScore = {
  resume_id: string;
  resume_name: string;
  resume_category: string;
  score: number;
  level: string;
  strongest_matches: string[];
  important_gaps: string[];
  reason: string;
};

export async function POST(request: NextRequest) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

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

    let user;
    try {
      ({ user } = await requireActiveUser(authHeader));
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as SelectBestResumeRequest;
    const jobId = body.job_id?.trim();

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required." },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
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
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? "Job not found." },
        { status: 404 }
      );
    }

    if (!job.job_description?.trim()) {
      return NextResponse.json(
        {
          error:
            "This job does not contain enough job-description text for resume comparison.",
        },
        { status: 400 }
      );
    }

    const { data: resumes, error: resumesError } = await supabase
      .from("resumes")
      .select(`
        id,
        user_id,
        name,
        category,
        resume_text,
        parsing_status,
        is_primary
      `)
      .eq("user_id", user.id)
      .eq("parsing_status", "completed");

    if (resumesError) {
      return NextResponse.json(
        {
          error: `Resumes could not be loaded: ${resumesError.message}`,
        },
        { status: 500 }
      );
    }

    const parsedResumes = (resumes ?? []).filter(
      (resume) => resume.resume_text?.trim()
    );

    if (parsedResumes.length === 0) {
      return NextResponse.json(
        {
          error:
            "No parsed resumes are available. Parse at least one resume first.",
        },
        { status: 400 }
      );
    }

    const resumeBundle = parsedResumes
      .map(
        (resume, index) => `
RESUME ${index + 1}

ID:
${resume.id}

NAME:
${resume.name}

CATEGORY:
${resume.category ?? ""}

PRIMARY:
${resume.is_primary ? "Yes" : "No"}

RESUME TEXT:
${resume.resume_text}
`
      )
      .join("\n\n====================\n\n");

    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: [
        {
          role: "system",
          content: `
You are the Resume Selection Agent for an AI Career OS.

Compare one real job description against multiple real resumes belonging to the same candidate.

Use only evidence found in the supplied job description and resumes.

Do not invent skills, certifications, achievements, projects, employers, tools, or experience.

Do not automatically prefer the primary resume.

Score every resume independently out of 100 using:

- Required skills and keywords: 35
- Relevant experience and responsibilities: 25
- Role and domain alignment: 15
- Certifications and tools: 10
- Seniority and years-of-experience alignment: 10
- ATS/readability relevance: 5

Level rules:
- 75 to 100 = High Match
- 50 to 74 = Medium Match
- 0 to 49 = Low Match

Return valid JSON only.

Required JSON:

{
  "best_resume_id": "",
  "best_resume_name": "",
  "best_score": 0,
  "selection_reason": "",
  "rankings": [
    {
      "resume_id": "",
      "resume_name": "",
      "resume_category": "",
      "score": 0,
      "level": "High Match",
      "strongest_matches": [],
      "important_gaps": [],
      "reason": ""
    }
  ]
}

Rules:
1. Include every supplied resume exactly once.
2. Sort highest score to lowest.
3. best_resume_id must equal the first ranked resume.
4. Be conservative with scoring.
5. Avoid score inflation.
6. If two resumes are close, explain the difference.
7. Use only facts in the supplied job and resume text.
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

========================================

CANDIDATE RESUMES:

${resumeBundle}
          `.trim(),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        { error: "AI returned no resume-selection analysis." },
        { status: 500 }
      );
    }

    let selection;

    try {
      const cleaned = outputText
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/, "")
        .trim();

      selection = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        {
          error: "AI response could not be parsed as JSON.",
          raw_response: outputText,
        },
        { status: 500 }
      );
    }

    const rankings: ResumeScore[] = Array.isArray(selection.rankings)
      ? selection.rankings
      : [];

    rankings.sort(
      (a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)
    );

    const bestResume = rankings[0] ?? null;

    if (!bestResume) {
      return NextResponse.json(
        { error: "AI did not return any resume rankings." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,

      job: {
        id: job.id,
        title: job.title,
        company: job.company,
      },

      best_resume: {
        resume_id: bestResume.resume_id,
        resume_name: bestResume.resume_name,
        resume_category: bestResume.resume_category,
        score: bestResume.score,
        level: bestResume.level,
      },

      selection_reason: selection.selection_reason ?? "",

      rankings,
    });
  } catch (error) {
    console.error("select-best-resume error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected best-resume selection error.",
      },
      { status: 500 }
    );
  }
}
