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
  applied_at: string;
  interview_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
};

type EmailDraft = {
  subject: string;
  body: string;
};

const statusOptions = [
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
  const [emailDrafts, setEmailDrafts] = useState<
    Record<string, EmailDraft>
  >({});
  const [openEmailDraftId, setOpenEmailDraftId] = useState<
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

    setApplications((data ?? []) as Application[]);
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
          subject: `Application for ${application.role} – ${application.company}`,
          body: `Dear Hiring Manager,\n\nI am writing to express my interest in the ${application.role} position at ${application.company}. My background in project management, service delivery, stakeholder coordination, and technology operations aligns well with this opportunity.\n\nPlease find my resume attached for your review. I would welcome the opportunity to discuss how my experience can contribute to your team.\n\nThank you for your time and consideration.\n\nKind regards,`,
        },
    }));

    setOpenEmailDraftId(application.id);
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
  }

  async function copyEmailDraft(applicationId: string) {
    const draft = emailDrafts[applicationId];

    if (!draft) return;

    await navigator.clipboard.writeText(
      `Subject: ${draft.subject}\n\n${draft.body}`
    );

    setMessage(
      "Application email copied. Review the recipient, resume attachment, and content before sending."
    );
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
                  {applications.map((application) => (
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
                              Applied:{" "}
                              {formatDate(
                                application.applied_at
                              )}
                            </span>
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

                            <button
                              type="button"
                              onClick={() =>
                                copyEmailDraft(application.id)
                              }
                              className="mt-5 rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
                            >
                              Copy Reviewed Email
                            </button>
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
