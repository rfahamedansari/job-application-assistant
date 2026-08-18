import { NextRequest, NextResponse } from "next/server";

import {
  createResumeDocx,
  createResumePdf,
  makeResumeFileName,
} from "@/lib/resumeExport";
import { describeAccessError, requireActiveUser } from "@/lib/serverAuth";

type ExportResumeRequest = {
  format?: "docx" | "pdf";
  resume_text?: string;
  role?: string;
  company?: string;
};

export async function POST(request: NextRequest) {
  try {
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

    try {
      await requireActiveUser(authHeader);
    } catch (error) {
      const accessError = describeAccessError(error);
      return NextResponse.json({ error: accessError.message }, { status: accessError.status });
    }

    const body = (await request.json()) as ExportResumeRequest;
    const format = body.format;
    const resumeText = body.resume_text?.trim() ?? "";

    if (format !== "docx" && format !== "pdf") {
      return NextResponse.json(
        { error: "Choose Word or PDF format." },
        { status: 400 }
      );
    }

    if (!resumeText) {
      return NextResponse.json(
        { error: "The approved tailored resume is empty." },
        { status: 400 }
      );
    }

    if (resumeText.length > 100_000) {
      return NextResponse.json(
        { error: "The resume is too long to export." },
        { status: 400 }
      );
    }

    const baseName = makeResumeFileName(
      body.role ?? "Role",
      body.company ?? "Company"
    );

    if (format === "docx") {
      const file = await createResumeDocx(resumeText);
      const bodyBuffer = Uint8Array.from(file).buffer;

      return new NextResponse(bodyBuffer, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${baseName}.docx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const file = await createResumePdf(resumeText);
    const bodyBuffer = Uint8Array.from(file).buffer;

    return new NextResponse(bodyBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("export-tailored-resume error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected resume export error.",
      },
      { status: 500 }
    );
  }
}
