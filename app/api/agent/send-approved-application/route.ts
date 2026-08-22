import { NextRequest, NextResponse } from "next/server";

import { createResumePdf } from "@/lib/resumeExport";
import {
  createUserScopedClient,
  describeAccessError,
  requireActiveUser,
} from "@/lib/serverAuth";

export const runtime = "nodejs";

type SendApprovedApplicationRequest = {
  application_id?: string;
  recipient?: string;
  subject?: string;
  email_body?: string;
  resume_text?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  try {
    const { user } = await requireActiveUser(authorization);
    const supabase = createUserScopedClient(authorization);

    if (!supabase) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as SendApprovedApplicationRequest;
    const applicationId = body.application_id?.trim();
    const recipient = body.recipient?.trim();
    const subject = body.subject?.trim();
    const emailBody = body.email_body?.trim();
    const resumeText = body.resume_text?.trim();

    if (!applicationId || !recipient || !subject || !emailBody || !resumeText) {
      return NextResponse.json(
        { error: "Application, recipient, email and approved resume are required." },
        { status: 400 }
      );
    }

    if (!EMAIL_PATTERN.test(recipient)) {
      return NextResponse.json(
        { error: "Enter a valid recruiter email address." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json(
        {
          error:
            "Email delivery is not configured yet. Add RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel, then redeploy.",
        },
        { status: 503 }
      );
    }

    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select("id,user_id,role,company,status,application_method,contact_email")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .single();

    if (applicationError || !application) {
      return NextResponse.json(
        { error: "Application was not found for this account." },
        { status: 404 }
      );
    }

    if (application.status !== "Ready for Review") {
      return NextResponse.json(
        {
          error:
            application.status === "Applied"
              ? "This application is already marked as sent."
              : "Only applications that are Ready for Review can be sent.",
        },
        { status: 409 }
      );
    }

    const resumePdf = await createResumePdf(resumeText);
    const fileName = `${safeFilePart(application.role) || "Tailored"}-Resume.pdf`;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const senderName = process.env.RESEND_FROM_NAME?.trim() || "Ahamed AI Career OS";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        to: [recipient],
        subject,
        text: emailBody,
        attachments: [
          {
            filename: fileName,
            content: Buffer.from(resumePdf).toString("base64"),
          },
        ],
      }),
    });

    const resendResult = (await resendResponse.json()) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };

    if (!resendResponse.ok || !resendResult.id) {
      return NextResponse.json(
        {
          error:
            resendResult.error?.message ||
            resendResult.message ||
            "The email provider rejected the message.",
        },
        { status: 502 }
      );
    }

    const appliedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("applications")
      .update({ status: "Applied", applied_at: appliedAt })
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .eq("status", "Ready for Review");

    if (updateError) {
      return NextResponse.json(
        {
          error:
            "Email was sent, but the application tracker could not be updated. Do not send it again; refresh and update the status manually.",
          email_id: resendResult.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      email_id: resendResult.id,
      applied_at: appliedAt,
    });
  } catch (error) {
    const accessError = describeAccessError(error);

    if (accessError.status === 401 || accessError.status === 403) {
      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Approved email could not be sent.",
      },
      { status: 500 }
    );
  }
}
