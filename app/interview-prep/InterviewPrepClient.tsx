"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type InterviewPrep = {
  id: string;
  user_id: string;
  application_id: string | null;
  job_id: string | null;
  company: string | null;
  role: string | null;
  interview_date: string | null;
  interview_type: string | null;
  status: string | null;
  technical_topics: string | null;
  hr_questions: string | null;
  star_examples: string | null;
  questions_to_ask: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ApplicationOption = {
  id: string;
  role: string;
  company: string;
};

type InterviewDraft = {
  role: string;
  company: string;
  interviewDate: string;
  interviewType: string;
  status: string;
  technicalTopics: string;
  hrQuestions: string;
  starExamples: string;
  questionsToAsk: string;
  notes: string;
};

const interviewTypes = [
  "HR",
  "Technical",
  "Managerial",
  "Client",
  "Final Round",
];

const interviewStatuses = [
  "Preparing",
  "Scheduled",
  "Completed",
  "Passed",
  "Rejected",
];

export default function InterviewPrepClient() {
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<InterviewPrep[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, InterviewDraft>>({});

  const [applicationId, setApplicationId] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewType, setInterviewType] = useState("Technical");
  const [status, setStatus] = useState("Preparing");
  const [technicalTopics, setTechnicalTopics] = useState("");
  const [hrQuestions, setHrQuestions] = useState("");
  const [starExamples, setStarExamples] = useState("");
  const [questionsToAsk, setQuestionsToAsk] = useState("");
  const [notes, setNotes] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | "info"
  >("info");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);

  function toInputDate(value: string | null) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function createDraft(record: InterviewPrep): InterviewDraft {
    return {
      role: record.role ?? "",
      company: record.company ?? "",
      interviewDate: toInputDate(record.interview_date),
      interviewType: record.interview_type ?? "Technical",
      status: record.status ?? "Preparing",
      technicalTopics: record.technical_topics ?? "",
      hrQuestions: record.hr_questions ?? "",
      starExamples: record.star_examples ?? "",
      questionsToAsk: record.questions_to_ask ?? "",
      notes: record.notes ?? "",
    };
  }

  const loadData = useCallback(async () => {
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

    const { data: prepData, error: prepError } = await supabase
      .from("interview_prep")
      .select("*")
      .eq("user_id", user.id)
      .order("interview_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false });

    if (prepError) {
      setMessage(
        `Unable to load interview prep: ${prepError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const { data: applicationData, error: applicationError } =
      await supabase
        .from("applications")
        .select("id, role, company")
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false });

    if (applicationError) {
      setMessage(
        `Unable to load applications: ${applicationError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const loadedRecords = (prepData ?? []) as InterviewPrep[];

    setRecords(loadedRecords);
    setApplications(
      (applicationData ?? []) as ApplicationOption[]
    );

    const nextDrafts: Record<string, InterviewDraft> = {};

    loadedRecords.forEach((record) => {
      nextDrafts[record.id] = createDraft(record);
    });

    setDrafts(nextDrafts);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const applicationIdFromUrl = searchParams.get("applicationId");

    if (!applicationIdFromUrl || applications.length === 0) {
      return;
    }

    const selected = applications.find(
      (application) => application.id === applicationIdFromUrl
    );

    if (!selected) {
      return;
    }

    setApplicationId(selected.id);
    setRole(selected.role);
    setCompany(selected.company);
  }, [searchParams, applications]);

  function handleApplicationChange(value: string) {
    setApplicationId(value);

    const selected = applications.find(
      (application) => application.id === value
    );

    if (selected) {
      setRole(selected.role);
      setCompany(selected.company);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (!role.trim()) {
      setMessage("Please enter the interview role.");
      setMessageType("error");
      return;
    }

    if (!company.trim()) {
      setMessage("Please enter the company.");
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

    const { error } = await supabase
      .from("interview_prep")
      .insert({
        user_id: user.id,
        application_id: applicationId || null,
        company: company.trim(),
        role: role.trim(),
        interview_date: interviewDate
          ? new Date(`${interviewDate}T12:00:00`).toISOString()
          : null,
        interview_type: interviewType,
        status,
        technical_topics: technicalTopics.trim() || null,
        hr_questions: hrQuestions.trim() || null,
        star_examples: starExamples.trim() || null,
        questions_to_ask: questionsToAsk.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage(
        `Interview prep could not be saved: ${error.message}`
      );
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setApplicationId("");
    setCompany("");
    setRole("");
    setInterviewDate("");
    setInterviewType("Technical");
    setStatus("Preparing");
    setTechnicalTopics("");
    setHrQuestions("");
    setStarExamples("");
    setQuestionsToAsk("");
    setNotes("");

    setMessage("Interview prep added successfully.");
    setMessageType("success");

    await loadData();
    setIsSaving(false);
  }

  function updateDraft(
    recordId: string,
    field: keyof InterviewDraft,
    value: string
  ) {
    setDrafts((current) => ({
      ...current,
      [recordId]: {
        ...current[recordId],
        [field]: value,
      },
    }));
  }

  async function saveRecordChanges(record: InterviewPrep) {
    const draft = drafts[record.id];

    if (!draft) return;

    if (!draft.role.trim()) {
      setMessage("Role cannot be empty.");
      setMessageType("error");
      return;
    }

    if (!draft.company.trim()) {
      setMessage("Company cannot be empty.");
      setMessageType("error");
      return;
    }

    setSavingRecordId(record.id);
    setMessage("");

    const interviewDateValue = draft.interviewDate
      ? new Date(`${draft.interviewDate}T12:00:00`).toISOString()
      : null;

    const { error } = await supabase
      .from("interview_prep")
      .update({
        role: draft.role.trim(),
        company: draft.company.trim(),
        interview_date: interviewDateValue,
        interview_type: draft.interviewType,
        status: draft.status,
        technical_topics:
          draft.technicalTopics.trim() || null,
        hr_questions:
          draft.hrQuestions.trim() || null,
        star_examples:
          draft.starExamples.trim() || null,
        questions_to_ask:
          draft.questionsToAsk.trim() || null,
        notes: draft.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    if (error) {
      setMessage(
        `Interview changes could not be saved: ${error.message}`
      );
      setMessageType("error");
      setSavingRecordId(null);
      return;
    }

    setRecords((current) =>
      current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              role: draft.role.trim(),
              company: draft.company.trim(),
              interview_date: interviewDateValue,
              interview_type: draft.interviewType,
              status: draft.status,
              technical_topics:
                draft.technicalTopics.trim() || null,
              hr_questions:
                draft.hrQuestions.trim() || null,
              star_examples:
                draft.starExamples.trim() || null,
              questions_to_ask:
                draft.questionsToAsk.trim() || null,
              notes: draft.notes.trim() || null,
            }
          : item
      )
    );

    setMessage("Interview changes saved successfully.");
    setMessageType("success");
    setSavingRecordId(null);
  }

  async function deleteRecord(recordId: string) {
    const confirmed = window.confirm(
      "Delete this interview prep record?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("interview_prep")
      .delete()
      .eq("id", recordId);

    if (error) {
      setMessage(`Delete failed: ${error.message}`);
      setMessageType("error");
      return;
    }

    setRecords((current) =>
      current.filter((record) => record.id !== recordId)
    );

    setDrafts((current) => {
      const next = { ...current };
      delete next[recordId];
      return next;
    });

    setMessage("Interview prep deleted.");
    setMessageType("success");
  }

  const scheduledCount = records.filter(
    (record) => record.status === "Scheduled"
  ).length;

  const preparingCount = records.filter(
    (record) => record.status === "Preparing"
  ).length;

  const completedCount = records.filter((record) =>
    ["Completed", "Passed", "Rejected"].includes(
      record.status ?? ""
    )
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
        <div className="mx-auto min-h-screen max-w-7xl">
          <section className="flex-1 p-6 md:p-10">
            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                Interview Preparation Workspace
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Prepare for every interview
              </h2>

              <p className="mt-2 max-w-3xl text-slate-400">
                Organize technical topics, HR questions,
                STAR examples, questions to ask, and interview
                notes in one place.
              </p>
            </header>

            {message && (
              <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
              >
                {message}
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Total Interviews
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {records.length}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Preparing
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {preparingCount}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Scheduled
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {scheduledCount}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">
                  Completed
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {completedCount}
                </p>
              </article>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">

              <form
                onSubmit={handleSubmit}
                className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <h3 className="text-xl font-semibold">
                  Add Interview Prep
                </h3>

                <div className="mt-6 space-y-4">
                  <select
                    value={applicationId}
                    onChange={(event) =>
                      handleApplicationChange(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option value="">
                      Select application (optional)
                    </option>

                    {applications.map((application) => (
                      <option
                        key={application.id}
                        value={application.id}
                      >
                        {application.role} -{" "}
                        {application.company}
                      </option>
                    ))}
                  </select>

                  <input
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value)
                    }
                    placeholder="Role"
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
                    type="date"
                    value={interviewDate}
                    onChange={(event) =>
                      setInterviewDate(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <select
                    value={interviewType}
                    onChange={(event) =>
                      setInterviewType(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    {interviewTypes.map((option) => (
                      <option key={option} value={option}>
                        {option}
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
                    {interviewStatuses.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <textarea
                    value={technicalTopics}
                    onChange={(event) =>
                      setTechnicalTopics(event.target.value)
                    }
                    placeholder="Technical topics to prepare"
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <textarea
                    value={hrQuestions}
                    onChange={(event) =>
                      setHrQuestions(event.target.value)
                    }
                    placeholder="HR / behavioral questions"
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <textarea
                    value={starExamples}
                    onChange={(event) =>
                      setStarExamples(event.target.value)
                    }
                    placeholder="STAR examples"
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <textarea
                    value={questionsToAsk}
                    onChange={(event) =>
                      setQuestionsToAsk(event.target.value)
                    }
                    placeholder="Questions to ask interviewer"
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <textarea
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    placeholder="Additional notes"
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
                      : "Save Interview Prep"}
                  </button>
                </div>
              </form>

              <section>
                {isLoading ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                    Loading interview preparation...
                  </div>
                ) : records.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                    No interview prep yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {records.map((record) => {
                      const draft =
                        drafts[record.id] ?? createDraft(record);

                      return (
                        <article
                          key={record.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Role
                              </label>
                              <input
                                value={draft.role}
                                onChange={(event) =>
                                  updateDraft(
                                    record.id,
                                    "role",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Company
                              </label>
                              <input
                                value={draft.company}
                                onChange={(event) =>
                                  updateDraft(
                                    record.id,
                                    "company",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Interview Date
                              </label>
                              <input
                                type="date"
                                value={draft.interviewDate}
                                onChange={(event) =>
                                  updateDraft(
                                    record.id,
                                    "interviewDate",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Interview Type
                              </label>
                              <select
                                value={draft.interviewType}
                                onChange={(event) =>
                                  updateDraft(
                                    record.id,
                                    "interviewType",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              >
                                {interviewTypes.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium">
                                Status
                              </label>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  updateDraft(
                                    record.id,
                                    "status",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                              >
                                {interviewStatuses.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              Technical Topics
                            </label>
                            <textarea
                              value={draft.technicalTopics}
                              onChange={(event) =>
                                updateDraft(
                                  record.id,
                                  "technicalTopics",
                                  event.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              HR Questions
                            </label>
                            <textarea
                              value={draft.hrQuestions}
                              onChange={(event) =>
                                updateDraft(
                                  record.id,
                                  "hrQuestions",
                                  event.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              STAR Examples
                            </label>
                            <textarea
                              value={draft.starExamples}
                              onChange={(event) =>
                                updateDraft(
                                  record.id,
                                  "starExamples",
                                  event.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              Questions to Ask
                            </label>
                            <textarea
                              value={draft.questionsToAsk}
                              onChange={(event) =>
                                updateDraft(
                                  record.id,
                                  "questionsToAsk",
                                  event.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-medium">
                              Notes
                            </label>
                            <textarea
                              value={draft.notes}
                              onChange={(event) =>
                                updateDraft(
                                  record.id,
                                  "notes",
                                  event.target.value
                                )
                              }
                              rows={4}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                            />
                          </div>

                          <div className="mt-5 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                saveRecordChanges(record)
                              }
                              disabled={
                                savingRecordId === record.id
                              }
                              className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                            >
                              {savingRecordId === record.id
                                ? "Saving..."
                                : "Save Changes"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                deleteRecord(record.id)
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
