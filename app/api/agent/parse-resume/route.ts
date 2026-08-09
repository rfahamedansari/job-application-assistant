import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { PDFExtract } from "pdf.js-extract";

type ParseResumeRequest = {
  resume_id?: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error: "Supabase environment variables are missing.",
        },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Missing authentication token.",
        },
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
        {
          error: "Invalid or expired session.",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as ParseResumeRequest;
    const resumeId = body.resume_id?.trim();

    if (!resumeId) {
      return NextResponse.json(
        {
          error: "resume_id is required.",
        },
        { status: 400 }
      );
    }

    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select(`
        id,
        user_id,
        name,
        file_name,
        file_path
      `)
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (resumeError || !resume) {
      return NextResponse.json(
        {
          error:
            resumeError?.message ??
            "Resume could not be found.",
        },
        { status: 404 }
      );
    }

    if (!resume.file_path) {
      return NextResponse.json(
        {
          error: "Resume does not have a stored file.",
        },
        { status: 400 }
      );
    }

    await supabase
      .from("resumes")
      .update({
        parsing_status: "processing",
        parsing_error: null,
      })
      .eq("id", resume.id)
      .eq("user_id", user.id);

    const { data: fileData, error: downloadError } =
      await supabase.storage
        .from("resumes")
        .download(resume.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("resumes")
        .update({
          parsing_status: "failed",
          parsing_error:
            downloadError?.message ??
            "Resume file could not be downloaded.",
        })
        .eq("id", resume.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        {
          error:
            downloadError?.message ??
            "Resume file could not be downloaded.",
        },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = resume.file_name.toLowerCase();

    let extractedText = "";

    if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({
        buffer,
      });

      extractedText = result.value;
    } else if (fileName.endsWith(".pdf")) {
      const pdfExtract = new PDFExtract();

      const pdfData = await new Promise<any>((resolve, reject) => {
        pdfExtract.extractBuffer(
          buffer,
          {},
          (error, data) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(data);
          }
        );
      });

      extractedText = (pdfData.pages ?? [])
        .map((page: any) =>
          (page.content ?? [])
            .map((item: any) => item.str ?? "")
            .join(" ")
        )
        .join("\n");
    } else if (fileName.endsWith(".txt")) {
      extractedText = buffer.toString("utf-8");
    } else {
      await supabase
        .from("resumes")
        .update({
          parsing_status: "failed",
          parsing_error:
            "Unsupported resume file type.",
        })
        .eq("id", resume.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        {
          error:
            "Unsupported resume file type. Use PDF, DOCX, or TXT.",
        },
        { status: 400 }
      );
    }

    const cleanedText = extractedText
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    if (!cleanedText) {
      await supabase
        .from("resumes")
        .update({
          parsing_status: "failed",
          parsing_error:
            "No readable text could be extracted from this resume.",
        })
        .eq("id", resume.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        {
          error:
            "No readable text could be extracted from this resume.",
        },
        { status: 422 }
      );
    }

    const { error: updateError } = await supabase
      .from("resumes")
      .update({
        resume_text: cleanedText,
        parsing_status: "completed",
        parsed_at: new Date().toISOString(),
        parsing_error: null,
      })
      .eq("id", resume.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            `Resume text could not be saved: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      resume: {
        id: resume.id,
        name: resume.name,
        file_name: resume.file_name,
        parsing_status: "completed",
        character_count: cleanedText.length,
        preview: cleanedText.slice(0, 800),
      },
    });
  } catch (error) {
    console.error("parse-resume error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected resume parsing error.",
      },
      { status: 500 }
    );
  }
}