"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type Recruiter = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  related_job_id: string | null;
  status: string;
  last_contact_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type JobOption = {
  id: string;
  title: string;
  company: string;
};

type RecruiterDraft = {
  status: string;
  lastContactDate: string;
  followUpDate: string;
  notes: string;
};

const recruiterStatuses = [
  "New Contact",
  "Contacted",
  "Follow-up Due",
  "In Discussion",
  "Interview Scheduled",
  "Closed",
];

export default function RecruitersPage() {
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  const [drafts, setDrafts] = useState<
    Record<string, RecruiterDraft>
  >({});

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [relatedJobId, setRelatedJobId] = useState("");
  const [status, setStatus] = useState("New Contact");
  const [lastContactDate, setLastContactDate] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | "info"
  >("info");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingRecruiterId, setSavingRecruiterId] =
    useState<string | null>(null);

  function toInputDate(value: string | null) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function createDraft(recruiter: Recruiter): RecruiterDraft {
    return {
      status: recruiter.status,
      lastContactDate: toInputDate(recruiter.last_contact_at),
      followUpDate: toInputDate(recruiter.follow_up_at),
      notes: recruiter.notes ?? "",
    };
  }

  const loadRecruiters = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Please sign in again.");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const { data: recruiterData, error: recruiterError } =
      await supabase
        .from("recruiters")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (recruiterError) {
      setMessage(
        `Unable to load recruiters: ${recruiterError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const { data: jobData, error: jobError } =
      await supabase
        .from("jobs")
        .select("id, title, company")
        .order("created_at", { ascending: false });

    if (jobError) {
      setMessage(`Unable to load jobs: ${jobError.message}`);
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const loadedRecruiters =
      (recruiterData ?? []) as Recruiter[];

    setRecruiters(loadedRecruiters);
    setJobs((jobData ?? []) as JobOption[]);

    const nextDrafts: Record<string, RecruiterDraft> = {};

    loadedRecruiters.forEach((recruiter) => {
      nextDrafts[recruiter.id] = createDraft(recruiter);
    });

    setDrafts(nextDrafts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRecruiters();
  }, [loadRecruiters]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (!name.trim()) {
      setMessage("Please enter the recruiter name.");
      setMessageType("error");
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Please sign in again.");
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.from("recruiters").insert({
      user_id: user.id,
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
      related_job_id: relatedJobId || null,
      status,
      last_contact_at: lastContactDate
        ? new Date(
            `${lastContactDate}T12:00:00`
          ).toISOString()
        : null,
      follow_up_at: followUpDate
        ? new Date(
            `${followUpDate}T12:00:00`
          ).toISOString()
        : null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(
        `Recruiter could not be saved: ${error.message}`
      );
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setLinkedinUrl("");
    setRelatedJobId("");
    setStatus("New Contact");
    setLastContactDate("");
    setFollowUpDate("");
    setNotes("");

    setMessage("Recruiter added successfully.");
    setMessageType("success");

    await loadRecruiters();

    setIsSaving(false);
  }

  function updateDraft(
    recruiterId: string,
    field: keyof RecruiterDraft,
    value: string
  ) {
    setDrafts((current) => ({
      ...current,
      [recruiterId]: {
        ...current[recruiterId],
        [field]: value,
      },
    }));
  }

  async function saveRecruiterChanges(
    recruiter: Recruiter
  ) {
    const draft = drafts[recruiter.id];

    if (!draft) return;

    setSavingRecruiterId(recruiter.id);
    setMessage("");

    const lastContactValue = draft.lastContactDate
      ? new Date(
          `${draft.lastContactDate}T12:00:00`
        ).toISOString()
      : null;

    const followUpValue = draft.followUpDate
      ? new Date(
          `${draft.followUpDate}T12:00:00`
        ).toISOString()
      : null;

    const { error } = await supabase
      .from("recruiters")
      .update({
        status: draft.status,
        last_contact_at: lastContactValue,
        follow_up_at: followUpValue,
        notes: draft.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recruiter.id);

    if (error) {
      setMessage(
        `Recruiter changes could not be saved: ${error.message}`
      );
      setMessageType("error");
      setSavingRecruiterId(null);
      return;
    }

    setRecruiters((current) =>
      current.map((item) =>
        item.id === recruiter.id
          ? {
              ...item,
              status: draft.status,
              last_contact_at: lastContactValue,
              follow_up_at: followUpValue,
              notes: draft.notes.trim() || null,
            }
          : item
      )
    );

    setMessage("Recruiter changes saved successfully.");
    setMessageType("success");
    setSavingRecruiterId(null);
  }

  async function deleteRecruiter(recruiterId: string) {
    const confirmed = window.confirm(
      "Delete this recruiter from your tracker?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("recruiters")
      .delete()
      .eq("id", recruiterId);

    if (error) {
      setMessage(`Delete failed: ${error.message}`);
      setMessageType("error");
      return;
    }

    setRecruiters((current) =>
      current.filter(
        (recruiter) => recruiter.id !== recruiterId
      )
    );

    setDrafts((current) => {
      const next = { ...current };
      delete next[recruiterId];
      return next;
    });

    setMessage("Recruiter deleted.");
    setMessageType("success");
  }

  const followUpsDue = recruiters.filter((recruiter) => {
    if (!recruiter.follow_up_at) return false;

    const followUp = new Date(recruiter.follow_up_at);

    return followUp.getTime() <= Date.now();
  }).length;

  const activeRecruiters = recruiters.filter(
    (recruiter) => recruiter.status !== "Closed"
  ).length;

  const messageStyles = {
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    error:
      "border-red-500/30 bg-red-500/10 text-red-200",
    info:
      "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl">

          <aside className="hidden w-64 border-r border-slate-800 bg-slate-900 p-6 lg:block">
            <div className="mb-10">
              <p className="text-sm font-medium text-cyan-400">
                Ahamed AI Career OS
              </p>

              <h1 className="mt-2 text-2xl font-bold">
                Recruiters
              </h1>
            </div>

            <nav className="space-y-2 text-sm">
              <Link
                href="/"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Dashboard
              </Link>

              <Link
                href="/jobs"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Jobs
              </Link>

              <Link
                href="/resumes"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Resume Library
              </Link>

              <Link
                href="/applications"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Applications
              </Link>

              <Link
                href="/profile"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Profile & Preferences
              </Link>

              <Link
                href="/recruiters"
                className="block rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950"
              >
                Recruiters
              </Link>
            </nav>
          </aside>

          <section className="flex-1 p-6 md:p-10">

            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                Recruiter Relationship Tracker
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Manage recruiter contacts and follow-ups
              </h2>

              <p className="mt-2 max-w-3xl text-slate-400">
                Save recruiter contact details, track contact
                dates, manage follow-ups and keep conversation
                notes.
              </p>
            </header>

            {message && (
              <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
              >
                {message}
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Total Recruiters
                </p>

                <p className="mt-3 text-3xl font-bold">
                  {recruiters.length}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Active Contacts
                </p>

                <p className="mt-3 text-3xl font-bold">
                  {activeRecruiters}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Follow-ups Due
                </p>

                <p className="mt-3 text-3xl font-bold">
                  {followUpsDue}
                </p>
              </article>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[390px_1fr]">

              {/* ADD RECRUITER */}

              <form
                onSubmit={handleSubmit}
                className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <h3 className="text-xl font-semibold">
                  Add Recruiter
                </h3>

                <div className="mt-6 space-y-4">

                  <input
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="Recruiter name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={company}
                    onChange={(event) =>
                      setCompany(event.target.value)
                    }
                    placeholder="Company"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="Email"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value)
                    }
                    placeholder="Phone / WhatsApp"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(event) =>
                      setLinkedinUrl(event.target.value)
                    }
                    placeholder="LinkedIn URL"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <select
                    value={relatedJobId}
                    onChange={(event) =>
                      setRelatedJobId(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="">
                      No related job
                    </option>

                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} - {job.company}
                      </option>
                    ))}
                  </select>

                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    {recruiterStatuses.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Last contact date
                    </label>

                    <input
                      type="date"
                      value={lastContactDate}
                      onChange={(event) =>
                        setLastContactDate(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Follow-up date
                    </label>

                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(event) =>
                        setFollowUpDate(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                    />
                  </div>

                  <textarea
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    placeholder="Discussion notes..."
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                  >
                    {isSaving
                      ? "Saving..."
                      : "Add Recruiter"}
                  </button>

                </div>
              </form>

              {/* RECRUITER LIST */}

              <section>
                {isLoading ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                    Loading recruiters...
                  </div>
                ) : recruiters.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                    No recruiters yet.
                  </div>
                ) : (
                  <div className="space-y-4">

                    {recruiters.map((recruiter) => {
                      const draft =
                        drafts[recruiter.id] ??
                        createDraft(recruiter);

                      return (
                        <article
                          key={recruiter.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                        >
                          <h3 className="text-xl font-semibold">
                            {recruiter.name}
                          </h3>

                          {recruiter.company && (
                            <p className="mt-1 text-slate-300">
                              {recruiter.company}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-4 text-sm">

                            {recruiter.email && (
                              <a
                                href={`mailto:${recruiter.email}`}
                                className="text-cyan-400"
                              >
                                {recruiter.email}
                              </a>
                            )}

                            {recruiter.phone && (
                              <span className="text-slate-400">
                                {recruiter.phone}
                              </span>
                            )}

                          </div>

                          {recruiter.linkedin_url && (
                            <a
                              href={recruiter.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-block text-sm text-cyan-400"
                            >
                              Open LinkedIn
                            </a>
                          )}

                          <div className="mt-6 grid gap-4 md:grid-cols-2">

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Status
                              </label>

                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  updateDraft(
                                    recruiter.id,
                                    "status",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              >
                                {recruiterStatuses.map(
                                  (option) => (
                                    <option
                                      key={option}
                                      value={option}
                                    >
                                      {option}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Last Contact Date
                              </label>

                              <input
                                type="date"
                                value={draft.lastContactDate}
                                onChange={(event) =>
                                  updateDraft(
                                    recruiter.id,
                                    "lastContactDate",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Next Follow-up Date
                              </label>

                              <input
                                type="date"
                                value={draft.followUpDate}
                                onChange={(event) =>
                                  updateDraft(
                                    recruiter.id,
                                    "followUpDate",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              />
                            </div>

                          </div>

                          <div className="mt-5">

                            <label className="mb-2 block text-sm font-medium">
                              Notes
                            </label>

                            <textarea
                              value={draft.notes}
                              onChange={(event) =>
                                updateDraft(
                                  recruiter.id,
                                  "notes",
                                  event.target.value
                                )
                              }
                              rows={4}
                              placeholder="Recruiter discussion, salary, next action..."
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />

                          </div>

                          <div className="mt-5 flex flex-wrap gap-3">

                            <button
                              type="button"
                              onClick={() =>
                                saveRecruiterChanges(
                                  recruiter
                                )
                              }
                              disabled={
                                savingRecruiterId ===
                                recruiter.id
                              }
                              className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                            >
                              {savingRecruiterId ===
                              recruiter.id
                                ? "Saving..."
                                : "Save Changes"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                deleteRecruiter(
                                  recruiter.id
                                )
                              }
                              className="rounded-lg border border-red-500/40 px-5 py-3 font-semibold text-red-300 hover:bg-red-500/10"
                            >
                              Delete
                            </button>

                          </div>

                        </article>
                      );
                    })}

                  </div>
                )}
              </section>

            </section>

          </section>

        </div>
      </main>
    </AuthGuard>
  );
}