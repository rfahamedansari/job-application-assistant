"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type Application = {
  id: string;
  job_id: string | null;
  resume_id: string | null;
  role: string;
  company: string;
  source: string | null;
  job_url: string | null;
  status: string;
  applied_at: string | null;
  interview_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
  application_method?: string | null;
  contact_email?: string | null;
  recruiter_name?: string | null;
};

type EmailDraft = {
  recipient: string;
  subject: string;
  body: string;
};

type TailoringResult = {
  source_resume: {
    id: string;
    name: string;
    category: string;
  };
  tailoring: {
    ats_score: number;
    summary: string;
    matched_keywords: string[];
    missing_keywords: string[];
    recommended_changes: string[];
    truth_check: string;
    tailored_resume: string;
  };
};

const statusOptions = [
  "Ready for Review",
  "Applied",
  "Recruiter Contacted",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showEmailApplicationsOnly, setShowEmailApplicationsOnly] =
    useState(false);
  const [emailDrafts, setEmailDrafts] = useState<
    Record<string, EmailDraft>
  >({});
  const [approvedEmails, setApprovedEmails] = useState<
    Record<string, boolean>
  >({});
  const [openEmailDraftId, setOpenEmailDraftId] = useState<
    string | null
  >(null);
  const [tailoringResults, setTailoringResults] = useState<
    Record<string, TailoringResult>
  >({});
  const [openTailoringId, setOpenTailoringId] = useState<
    string | null
  >(null);
  const [tailoringApplicationId, setTailoringApplicationId] =
    useState<string | null>(null);
  const [approvedTailoring, setApprovedTailoring] = useState<
    Record<string, boolean>
  >({});
  const [tailoringErrors, setTailoringErrors] = useState<
    Record<string, string>
  >({});
  const [exportingResume, setExportingResume] = useState<
    { applicationId: string; format: "docx" | "pdf" } | null
  >(null);
  const [sendingApplicationId, setSendingApplicationId] = useState<
    string | null
  >(null);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Please sign in again.");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("applied_at", { ascending: false });

    if (error) {
      setMessage(`Unable to load applications: ${error.message}`);
      setIsLoading(false);
      return;
    }

    const loadedApplications = (data ?? []) as Application[];
    const jobIds = loadedApplications
      .map((application) => application.job_id)
      .filter((jobId): jobId is string => Boolean(jobId));

    let jobDetails = new Map<
      string,
      {
        application_method: string | null;
        contact_email: string | null;
        recruiter_name: string | null;
      }
    >();

    if (jobIds.length > 0) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, application_method, contact_email, recruiter_name")
        .in("id", jobIds);

      jobDetails = new Map(
        (jobsData ?? []).map((job) => [job.id, job])
      );
    }

    setApplications(
      loadedApplications.map((application) => ({
        ...application,
        ...(application.job_id
          ? jobDetails.get(application.job_id)
          : undefined),
      }))
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  async function updateStatus(
    applicationId: string,
    newStatus: string
  ) {
    const updates: {
      status: string;
      updated_at: string;
      interview_at?: string;
    } = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "Interview") {
      updates.interview_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("applications")
      .update(updates)
      .eq("id", applicationId);

    if (error) {
      setMessage(`Status update failed: ${error.message}`);
      return;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              status: newStatus,
              interview_at:
                newStatus === "Interview"
                  ? new Date().toISOString()
                  : application.interview_at,
            }
          : application
      )
    );

    setMessage("Application status updated.");
  }

  async function updateNotes(
    applicationId: string,
    notes: string
  ) {
    const { error } = await supabase
      .from("applications")
      .update({
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (error) {
      setMessage(`Notes could not be saved: ${error.message}`);
      return;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? { ...application, notes }
          : application
      )
    );

    setMessage("Notes saved.");
  }

  async function deleteApplication(applicationId: string) {
    const confirmed = window.confirm(
      "Remove this application from your tracker?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId);

    if (error) {
      setMessage(`Delete failed: ${error.message}`);
      return;
    }

    setApplications((current) =>
      current.filter(
        (application) => application.id !== applicationId
      )
    );

    setMessage("Application removed.");
  }

  function prepareEmailDraft(application: Application) {
    setEmailDrafts((current) => ({
      ...current,
      [application.id]:
        current[application.id] ?? {
          recipient: application.contact_email ?? "",
          subject: `Application for ${application.role} – ${application.company}`,
          body: `Dear Hiring Manager,\n\nI am writing to express my interest in the ${application.role} position at ${application.company}. My background in project management, service delivery, stakeholder coordination, and technology operations aligns well with this opportunity.\n\nPlease find my resume attached for your review. I would welcome the opportunity to discuss how my experience can contribute to your team.\n\nThank you for your time and consideration.\n\nKind regards,`,
        },
    }));

    setApprovedEmails((current) => ({
      ...current,
      [application.id]: false,
    }));

    setOpenEmailDraftId(application.id);
  }

  async function prepareApprovalPackage(application: Application) {
    prepareEmailDraft(application);
    await prepareTailoredResume(application.id);
  }

  function updateEmailDraft(
    applicationId: string,
    field: keyof EmailDraft,
    value: string
  ) {
    setEmailDrafts((current) => ({
      ...current,
      [applicationId]: {
        ...current[applicationId],
        [field]: value,
      },
    }));
    setApprovedEmails((current) => ({
      ...current,
      [applicationId]: false,
    }));
  }

  function openApprovedEmail(applicationId: string) {
    const draft = emailDrafts[applicationId];

    if (!draft?.recipient.trim()) {
      setMessage("Add and verify the recruiter email address first.");
      return;
    }

    if (!approvedTailoring[applicationId] || !approvedEmails[applicationId]) {
      setMessage("Approve both the tailored resume and email before continuing.");
      return;
    }

    const href = `mailto:${encodeURIComponent(draft.recipient.trim())}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.location.href = href;
    setMessage(
      "Approved email opened in your mail app. Attach the downloaded approved resume and verify everything before sending."
    );
  }

  async function sendApprovedEmail(application: Application) {
    const draft = emailDrafts[application.id];
    const tailoring = tailoringResults[application.id];

    if (!draft?.recipient.trim()) {
      setMessage("Add and verify the recruiter email address first.");
      return;
    }

    if (!approvedEmails[application.id] || !approvedTailoring[application.id]) {
      setMessage("Approve both the tailored resume and email before sending.");
      return;
    }

    if (!tailoring?.tailoring.tailored_resume.trim()) {
      setMessage("Prepare and approve the tailored resume before sending.");
      return;
    }

    const confirmed = window.confirm(
      `Send the approved application to ${draft.recipient.trim()} with the tailored PDF resume attached?`
    );

    if (!confirmed) return;

    setSendingApplicationId(application.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch("/api/agent/send-approved-application", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          application_id: application.id,
          recipient: draft.recipient.trim(),
          subject: draft.subject.trim(),
          email_body: draft.body.trim(),
          resume_text: tailoring.tailoring.tailored_resume,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Approved email could not be sent.");
      }

      setApplications((current) =>
        current.map((item) =>
          item.id === application.id
            ? { ...item, status: "Applied", applied_at: result.applied_at }
            : item
        )
      );
      setApprovedEmails((current) => ({
        ...current,
        [application.id]: false,
      }));
      setMessage(
        `Application sent to ${draft.recipient.trim()} with the approved PDF resume attached.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Approved email could not be sent."
      );
    } finally {
      setSendingApplicationId(null);
    }
  }

  async function copyEmailDraft(applicationId: string) {
    const draft = emailDrafts[applicationId];

    if (!draft) return;

    const emailText = `Subject: ${draft.subject}\n\n${draft.body}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(emailText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = emailText;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (!copied) {
          throw new Error("Browser denied clipboard access.");
        }
      }

      setMessage(
        "Email copied successfully. Review the recipient, resume attachment, and content before sending."
      );
    } catch {
      setMessage(
        "Copy was blocked by the browser. Select the subject and email text manually, then press Ctrl+C."
      );
    }
  }

  async function prepareTailoredResume(applicationId: string) {
    setTailoringApplicationId(applicationId);
    setMessage("");
    setOpenTailoringId(applicationId);
    setTailoringErrors((current) => ({ ...current, [applicationId]: "" }));
    setTailoringResults((current) => {
      const next = { ...current };
      delete next[applicationId];
      return next;
    });
    setApprovedTailoring((current) => ({
      ...current,
      [applicationId]: false,
    }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch("/api/agent/tailor-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ application_id: applicationId }),
      });

      const responseText = await response.text();
      let result: Partial<TailoringResult> & { error?: string } = {};

      if (responseText) {
        try {
          result = JSON.parse(responseText) as Partial<TailoringResult> & {
            error?: string;
          };
        } catch {
          throw new Error(
            `Resume tailoring returned an invalid response (HTTP ${response.status}). Please try again.`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Resume tailoring failed (HTTP ${response.status}). Please try again.`
        );
      }

      if (
        !result.source_resume?.id ||
        !result.tailoring?.tailored_resume?.trim()
      ) {
        throw new Error(
          "Resume tailoring completed without a usable draft. Please try again."
        );
      }

      setTailoringResults((current) => ({
        ...current,
        [applicationId]: result as TailoringResult,
      }));
      setTailoringErrors((current) => ({ ...current, [applicationId]: "" }));
      setMessage(
        "Tailored resume draft prepared. Review every section and approve it before copying."
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Resume tailoring failed.";
      setTailoringErrors((current) => ({
        ...current,
        [applicationId]: errorMessage,
      }));
      setMessage(errorMessage);
    } finally {
      setTailoringApplicationId(null);
    }
  }

  function updateTailoredResume(
    applicationId: string,
    value: string
  ) {
    setTailoringResults((current) => ({
      ...current,
      [applicationId]: {
        ...current[applicationId],
        tailoring: {
          ...current[applicationId].tailoring,
          tailored_resume: value,
        },
      },
    }));
    setApprovedTailoring((current) => ({
      ...current,
      [applicationId]: false,
    }));
  }

  async function copyTailoredResume(applicationId: string) {
    const result = tailoringResults[applicationId];

    if (!result || !approvedTailoring[applicationId]) {
      setMessage(
        "Review the tailored resume and tick the approval checkbox before copying."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(
        result.tailoring.tailored_resume
      );
      setMessage(
        "Approved tailored resume copied. The original stored resume was not changed."
      );
    } catch {
      setMessage(
        "Copy was blocked by the browser. Select the tailored resume text and press Ctrl+C."
      );
    }
  }

  async function downloadTailoredResume(
    application: Application,
    format: "docx" | "pdf"
  ) {
    const result = tailoringResults[application.id];

    if (!result || !approvedTailoring[application.id]) {
      setMessage(
        "Review the tailored resume and tick the approval checkbox before downloading."
      );
      return;
    }

    setExportingResume({ applicationId: application.id, format });
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(
        "/api/agent/export-tailored-resume",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            format,
            resume_text: result.tailoring.tailored_resume,
            role: application.role,
            company: application.company,
          }),
        }
      );

      if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult?.error ?? "Resume export failed.");
      }

      const file = await response.blob();
      const contentDisposition =
        response.headers.get("content-disposition") ?? "";
      const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const fileName =
        fileNameMatch?.[1] ?? `Tailored-Resume.${format}`;
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setMessage(
        `${format === "docx" ? "Word" : "PDF"} resume downloaded. Review the final file before applying.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Resume export failed."
      );
    } finally {
      setExportingResume(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "Not set";

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }

  const appliedCount = applications.filter(
    (item) => item.status === "Applied"
  ).length;

  const interviewCount = applications.filter(
    (item) => item.status === "Interview"
  ).length;

  const offerCount = applications.filter(
    (item) => item.status === "Offer"
  ).length;

  const emailApplicationCount = applications.filter(
    (item) => item.application_method === "email" || item.contact_email
  ).length;

  const displayedApplications = showEmailApplicationsOnly
    ? applications.filter(
        (item) => item.application_method === "email" || item.contact_email
      )
    : applications;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto min-h-screen max-w-7xl">
          <section className="flex-1 p-6 md:p-10">
            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                Application Pipeline
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Track your job applications
              </h2>

              <p className="mt-2 text-slate-400">
                Update application status, notes, interviews, and offers.
              </p>

              {emailApplicationCount > 0 && (
                <p className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                  Email Applications queue: {emailApplicationCount}
                </p>
              )}
            </header>

            {message && (
              <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
                {message}
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Total Applications
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {applications.length}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Applied
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {appliedCount}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Interviews
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {interviewCount}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Offers
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {offerCount}
                </p>
              </article>
            </section>

            <section className="mt-8">
              {applications.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEmailApplicationsOnly(false)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      !showEmailApplicationsOnly
                        ? "bg-cyan-500 text-slate-950"
                        : "border border-slate-700 text-slate-300"
                    }`}
                  >
                    All Applications ({applications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmailApplicationsOnly(true)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      showEmailApplicationsOnly
                        ? "bg-emerald-500 text-slate-950"
                        : "border border-emerald-500/50 text-emerald-300"
                    }`}
                  >
                    Email Applications ({emailApplicationCount})
                  </button>
                </div>
              )}
              {isLoading ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                  Loading applications...
                </div>
              ) : applications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                  <h3 className="text-xl font-semibold">
                    No applications yet
                  </h3>

                  <p className="mt-2 text-slate-400">
                    Go to Jobs and click Mark as Applied.
                  </p>

                  <Link
                    href="/jobs"
                    className="mt-5 inline-block rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950"
                  >
                    Open Jobs
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedApplications.map((application) => (
                    <article
                      key={application.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold">
                            {application.role}
                          </h3>

                          <p className="mt-1 text-slate-300">
                            {application.company}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-3 text-sm">
                            {application.source && (
                              <span className="text-cyan-400">
                                {application.source}
                              </span>
                            )}

                            <span className="text-slate-400">
                              {application.status === "Ready for Review"
                                ? "Added for review: "
                                : "Applied: "}
                              {formatDate(
                                application.applied_at
                              )}
                            </span>

                            {(application.application_method === "email" ||
                              application.contact_email) && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                Email application
                              </span>
                            )}
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              Application Status
                            </label>

                            <select
                              value={application.status}
                              onChange={(event) =>
                                updateStatus(
                                  application.id,
                                  event.target.value
                                )
                              }
                              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            >
                              {statusOptions.map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                >
                                  {status}
                                </option>
                              ))}
                            </select>
                          </div>

                          {application.status === "Interview" &&
                            application.interview_at && (
                              <p className="mt-3 text-sm text-emerald-400">
                                Interview recorded:{" "}
                                {formatDate(
                                  application.interview_at
                                )}
                              </p>
                            )}

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              Notes
                            </label>

                            <textarea
                              value={application.notes ?? ""}
                              onChange={(event) =>
                                setApplications((current) =>
                                  current.map((item) =>
                                    item.id === application.id
                                      ? {
                                          ...item,
                                          notes:
                                            event.target.value,
                                        }
                                      : item
                                  )
                                )
                              }
                              onBlur={(event) =>
                                updateNotes(
                                  application.id,
                                  event.target.value
                                )
                              }
                              placeholder="Recruiter discussion, salary, follow-up details..."
                              rows={3}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {(application.application_method === "email" ||
                            application.contact_email) && (
                            <button
                              type="button"
                              disabled={tailoringApplicationId === application.id}
                              onClick={() => prepareApprovalPackage(application)}
                              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {tailoringApplicationId === application.id
                                ? "Preparing Package..."
                                : "Prepare Approval Package"}
                            </button>
                          )}
                          {application.job_url && (
                            <a
                              href={application.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
                            >
                              Open Job
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={
                              tailoringApplicationId === application.id
                            }
                            onClick={() =>
                              prepareTailoredResume(application.id)
                            }
                            className="rounded-lg border border-violet-500/50 px-4 py-2 font-semibold text-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {tailoringApplicationId === application.id
                              ? "Tailoring..."
                              : "Tailor Resume"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              prepareEmailDraft(application)
                            }
                            className="rounded-lg border border-emerald-500/50 px-4 py-2 font-semibold text-emerald-300 hover:bg-emerald-500/10"
                          >
                            Prepare Email
                          </button>
 <Link
    href={`/interview-prep?applicationId=${application.id}`}
    className="rounded-lg border border-cyan-500 px-4 py-2 font-semibold text-cyan-300 hover:bg-cyan-500/10"
  >
    Prepare Interview
  </Link>
                          <button
                            type="button"
                            onClick={() =>
                              deleteApplication(
                                application.id
                              )
                            }
                            className="rounded-lg border border-red-500/40 px-4 py-2 text-red-300 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {openTailoringId === application.id && (
                        <section className="mt-6 rounded-xl border border-violet-500/30 bg-slate-950 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-violet-300">
                                AI Resume Tailoring Review
                              </h4>
                              <p className="mt-1 text-sm text-slate-400">
                                Review-only mode. Nothing is sent and your original resume is never replaced.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOpenTailoringId(null)}
                              className="text-sm text-slate-400 hover:text-white"
                            >
                              Close
                            </button>
                          </div>

                          {tailoringApplicationId === application.id &&
                          !tailoringResults[application.id] ? (
                            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-5 text-slate-300">
                              Comparing the saved job description with your parsed resume...
                            </div>
                          ) : tailoringResults[application.id] ? (
                            <div className="mt-5 space-y-5">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                                  <p className="text-sm text-slate-400">
                                    Source resume
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {tailoringResults[application.id].source_resume.name}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-400">
                                    {tailoringResults[application.id].source_resume.category}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                                  <p className="text-sm text-slate-400">
                                    Estimated ATS match
                                  </p>
                                  <p className="mt-1 text-3xl font-bold text-violet-300">
                                    {tailoringResults[application.id].tailoring.ats_score}%
                                  </p>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-medium">Analysis</h5>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                  {tailoringResults[application.id].tailoring.summary}
                                </p>
                              </div>

                              <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                  <h5 className="font-medium text-emerald-300">
                                    Supported keywords
                                  </h5>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {tailoringResults[application.id].tailoring.matched_keywords.map(
                                      (keyword) => (
                                        <span
                                          key={keyword}
                                          className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200"
                                        >
                                          {keyword}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <h5 className="font-medium text-amber-300">
                                    Gaps — not added
                                  </h5>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {tailoringResults[application.id].tailoring.missing_keywords.map(
                                      (keyword) => (
                                        <span
                                          key={keyword}
                                          className="rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-200"
                                        >
                                          {keyword}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-medium">
                                  Recommended changes
                                </h5>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                                  {tailoringResults[application.id].tailoring.recommended_changes.map(
                                    (change) => (
                                      <li key={change}>{change}</li>
                                    )
                                  )}
                                </ul>
                              </div>

                              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
                                <span className="font-semibold">Truth check: </span>
                                {tailoringResults[application.id].tailoring.truth_check}
                              </div>

                              <div>
                                <label className="block font-medium">
                                  Tailored Resume Draft
                                </label>
                                <textarea
                                  value={tailoringResults[application.id].tailoring.tailored_resume}
                                  onChange={(event) =>
                                    updateTailoredResume(
                                      application.id,
                                      event.target.value
                                    )
                                  }
                                  rows={24}
                                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm leading-6"
                                />
                              </div>

                              <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={
                                    approvedTailoring[application.id] ?? false
                                  }
                                  onChange={(event) =>
                                    setApprovedTailoring((current) => ({
                                      ...current,
                                      [application.id]: event.target.checked,
                                    }))
                                  }
                                  className="mt-1 h-4 w-4"
                                />
                                <span>
                                  I reviewed this draft against my real experience and approve it for copying. I will verify it again before applying.
                                </span>
                              </label>

                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  disabled={!approvedTailoring[application.id]}
                                  onClick={() => copyTailoredResume(application.id)}
                                  className="rounded-lg bg-violet-500 px-5 py-3 font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Copy Approved Resume
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !approvedTailoring[application.id] ||
                                    exportingResume?.applicationId === application.id
                                  }
                                  onClick={() =>
                                    downloadTailoredResume(application, "docx")
                                  }
                                  className="rounded-lg border border-cyan-500 px-5 py-3 font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {exportingResume?.applicationId === application.id &&
                                  exportingResume.format === "docx"
                                    ? "Creating Word..."
                                    : "Download Word"}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !approvedTailoring[application.id] ||
                                    exportingResume?.applicationId === application.id
                                  }
                                  onClick={() =>
                                    downloadTailoredResume(application, "pdf")
                                  }
                                  className="rounded-lg border border-emerald-500 px-5 py-3 font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {exportingResume?.applicationId === application.id &&
                                  exportingResume.format === "pdf"
                                    ? "Creating PDF..."
                                    : "Download PDF"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
                              aria-live="polite"
                            >
                              <p className="text-sm text-amber-100">
                                A reviewed tailored resume is required before email sending can be unlocked.
                              </p>
                              {tailoringErrors[application.id] && (
                                <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
                                  <p className="font-semibold">
                                    Tailored resume could not be generated
                                  </p>
                                  <p className="mt-1">
                                    {tailoringErrors[application.id]}
                                  </p>
                                </div>
                              )}
                              <button
                                type="button"
                                disabled={tailoringApplicationId === application.id}
                                onClick={() => prepareTailoredResume(application.id)}
                                className="mt-3 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {tailoringApplicationId === application.id
                                  ? "Generating Resume..."
                                  : tailoringErrors[application.id]
                                    ? "Try Tailoring Again"
                                    : "Generate Tailored Resume"}
                              </button>
                            </div>
                          )}
                        </section>
                      )}

                      {openEmailDraftId === application.id &&
                        emailDrafts[application.id] && (
                          <section className="mt-6 rounded-xl border border-emerald-500/30 bg-slate-950 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h4 className="font-semibold text-emerald-300">
                                  Application Email Draft
                                </h4>
                                <p className="mt-1 text-sm text-slate-400">
                                  Review and edit before copying. This draft is never sent automatically.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenEmailDraftId(null)
                                }
                                className="text-sm text-slate-400 hover:text-white"
                              >
                                Close
                              </button>
                            </div>

                            <label className="mt-5 block text-sm font-medium">
                              Recipient
                            </label>
                            <input
                              type="email"
                              value={emailDrafts[application.id].recipient}
                              onChange={(event) =>
                                updateEmailDraft(
                                  application.id,
                                  "recipient",
                                  event.target.value
                                )
                              }
                              placeholder="recruiter@company.com"
                              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"
                            />

                            <label className="mt-5 block text-sm font-medium">
                              Subject
                            </label>
                            <input
                              value={emailDrafts[application.id].subject}
                              onChange={(event) =>
                                updateEmailDraft(
                                  application.id,
                                  "subject",
                                  event.target.value
                                )
                              }
                              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"
                            />

                            <label className="mt-5 block text-sm font-medium">
                              Email Body
                            </label>
                            <textarea
                              value={emailDrafts[application.id].body}
                              onChange={(event) =>
                                updateEmailDraft(
                                  application.id,
                                  "body",
                                  event.target.value
                                )
                              }
                              rows={12}
                              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"
                            />

                            <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={approvedEmails[application.id] ?? false}
                                onChange={(event) =>
                                  setApprovedEmails((current) => ({
                                    ...current,
                                    [application.id]: event.target.checked,
                                  }))
                                }
                                className="mt-1 h-4 w-4"
                              />
                              <span>
                                I verified the recipient, subject and email body. I approve this email for the selected vacancy.
                              </span>
                            </label>

                            <div className="mt-5 grid gap-2 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm sm:grid-cols-2">
                              <span className={tailoringResults[application.id]?.tailoring.tailored_resume.trim() ? "text-emerald-300" : "text-amber-200"}>
                                {tailoringResults[application.id]?.tailoring.tailored_resume.trim() ? "✓" : "○"} Tailored resume generated
                              </span>
                              <span className={approvedTailoring[application.id] ? "text-emerald-300" : "text-amber-200"}>
                                {approvedTailoring[application.id] ? "✓" : "○"} Resume reviewed and approved
                              </span>
                              <span className={approvedEmails[application.id] ? "text-emerald-300" : "text-amber-200"}>
                                {approvedEmails[application.id] ? "✓" : "○"} Email reviewed and approved
                              </span>
                              <span className={application.status === "Ready for Review" ? "text-emerald-300" : "text-amber-200"}>
                                {application.status === "Ready for Review" ? "✓" : "○"} Status is Ready for Review
                              </span>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => copyEmailDraft(application.id)}
                                className="rounded-lg border border-emerald-500 px-5 py-3 font-semibold text-emerald-200 hover:bg-emerald-500/10"
                              >
                                Copy Reviewed Email
                              </button>
                              <button
                                type="button"
                                disabled={
                                  !approvedEmails[application.id] ||
                                  !approvedTailoring[application.id]
                                }
                                onClick={() => openApprovedEmail(application.id)}
                                className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Open Approved Email
                              </button>
                              <button
                                type="button"
                                disabled={
                                  !approvedEmails[application.id] ||
                                  !approvedTailoring[application.id] ||
                                  sendingApplicationId === application.id ||
                                  application.status !== "Ready for Review"
                                }
                                onClick={() => sendApprovedEmail(application)}
                                className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {sendingApplicationId === application.id
                                  ? "Sending..."
                                  : "Approve & Send Email"}
                              </button>
                            </div>

                            <p className="mt-3 text-xs text-amber-200">
                              Safety lock: automatic sending is OFF. Approve & Send requires both review checkboxes, asks for final confirmation, and attaches the approved PDF resume.
                            </p>
                          </section>
                        )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
