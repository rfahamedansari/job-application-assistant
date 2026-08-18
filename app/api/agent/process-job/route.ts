import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireActiveUser } from "@/lib/serverAuth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ProcessJobRequest = {
  raw_text?: string;
  source?: string;
  job_url?: string;
};

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    try {
      await requireActiveUser(request.headers.get("authorization"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status = message === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "Authentication required." : "Account approval required." },
        { status }
      );
    }

    const body = (await request.json()) as ProcessJobRequest;

    const rawText = body.raw_text?.trim();

    if (!rawText) {
      return NextResponse.json(
        {
          error: "raw_text is required.",
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
You are the Job Processing Agent for an AI Career OS.

Your task is to analyze raw job vacancy text or recruiter/social hiring posts.

Extract only information supported by the supplied text.
Never invent employer names, recruiter names, email addresses, salary, location, skills, dates, or employment terms.

Determine whether the content represents:
- formal_job
- recruiter_post

Determine application_method:
- email
- website
- manual

Choose the closest category from:
- Project Management
- PMO
- Service Delivery
- Telecom
- Operations
- Cloud
- Network Infrastructure
- General

Return valid JSON only.

Required JSON shape:

{
  "title": "",
  "company": "",
  "location": "",
  "country": "",
  "category": "",
  "source": "",
  "job_url": "",
  "job_description": "",
  "employment_type": "",
  "salary_text": "",
  "posted_at": null,
  "source_type": "formal_job",
  "application_method": "website",
  "contact_email": "",
  "recruiter_name": "",
  "source_post_text": "",
  "agent_notes": "",
  "skills": [],
  "requirements": []
}

Rules:

1. Preserve the important job responsibilities and requirements.
2. Extract email addresses exactly when present.
3. If the post asks candidates to send a CV by email, application_method must be "email".
4. If it looks like a social/recruiter hiring post rather than a formal job listing, source_type must be "recruiter_post".
5. Use empty strings for unknown text fields.
6. Use null for posted_at when no reliable date is present.
7. Do not infer facts that are not stated.
          `.trim(),
        },

        {
          role: "user",
          content: `
SOURCE:
${body.source ?? "Unknown"}

JOB URL:
${body.job_url ?? ""}

RAW JOB CONTENT:
${rawText}
          `.trim(),
        },
      ],
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        {
          error: "AI returned no structured job data.",
        },
        { status: 500 }
      );
    }

    let parsedJob;

    try {
      const cleaned = outputText
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/, "")
        .trim();

      parsedJob = JSON.parse(cleaned);
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
      job: {
        ...parsedJob,
        source:
          parsedJob.source ||
          body.source ||
          "Agent",

        job_url:
          parsedJob.job_url ||
          body.job_url ||
          "",

        source_post_text:
          parsedJob.source_post_text ||
          rawText,
      },
    });
  } catch (error) {
    console.error("process-job error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected AI processing error.",
      },
      { status: 500 }
    );
  }
}
