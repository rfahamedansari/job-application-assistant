"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type Resume = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  file_name: string;
  file_path: string | null;
  description: string | null;
  is_primary: boolean;
  created_at: string;
  parsing_status: string | null;
  parsed_at: string | null;
  parsing_error: string | null;
};

const resumeCategories = [
  "Project Manager",
  "PMO",
  "Service Delivery",
  "Telecom",
  "Cloud",
  "Operations",
  "General",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function ResumeLibraryPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeName, setResumeName] = useState("");
  const [category, setCategory] = useState("Project Manager");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | "info"
  >("info");

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [workingResumeId, setWorkingResumeId] = useState<string | null>(
    null
  );

  const showMessage = (
    text: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setMessage(text);
    setMessageType(type);
  };

  const loadResumes = useCallback(async () => {
    setIsLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      showMessage("Please sign in to view your resumes.", "error");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("resumes")
      .select(
        `
          id,
          user_id,
          name,
          category,
          file_name,
          file_path,
          description,
          is_primary,
          created_at,
          parsing_status,
          parsed_at,
          parsing_error
        `
      )
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      showMessage(`Unable to load resumes: ${error.message}`, "error");
      setIsLoading(false);
      return;
    }

    setResumes((data ?? []) as Resume[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const allowedExtensions = [".pdf", ".docx", ".txt"];
    const extension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      showMessage(
        "Please select a PDF, DOCX, or TXT resume.",
        "error"
      );
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showMessage("The maximum allowed file size is 10 MB.", "error");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    if (!resumeName.trim()) {
      setResumeName(file.name.replace(/\.[^/.]+$/, ""));
    }

    setMessage("");
  }

  function createSafeFileName(fileName: string) {
    return fileName
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!resumeName.trim()) {
      showMessage("Please enter a resume name.", "error");
      return;
    }

    if (!selectedFile) {
      showMessage("Please select a resume file.", "error");
      return;
    }

    setIsUploading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      showMessage("Your session has expired. Please sign in again.", "error");
      setIsUploading(false);
      return;
    }

    const safeFileName = createSafeFileName(selectedFile.name);
    const filePath = `${user.id}/${Date.now()}-${safeFileName}`;
    const shouldBePrimary = resumes.length === 0;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, selectedFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      showMessage(`File upload failed: ${uploadError.message}`, "error");
      setIsUploading(false);
      return;
    }

    const { error: databaseError } = await supabase
      .from("resumes")
      .insert({
        user_id: user.id,
        name: resumeName.trim(),
        category,
        file_name: selectedFile.name,
        file_path: filePath,
        description: description.trim() || null,
        is_primary: shouldBePrimary,
      });

    if (databaseError) {
      await supabase.storage.from("resumes").remove([filePath]);

      showMessage(
        `Resume information could not be saved: ${databaseError.message}`,
        "error"
      );
      setIsUploading(false);
      return;
    }

    setResumeName("");
    setCategory("Project Manager");
    setDescription("");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    showMessage("Resume uploaded successfully.", "success");
    await loadResumes();
    setIsUploading(false);
  }

  async function makePrimary(resumeId: string) {
    setWorkingResumeId(resumeId);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      showMessage("Please sign in again.", "error");
      setWorkingResumeId(null);
      return;
    }

    const { error: clearError } = await supabase
      .from("resumes")
      .update({ is_primary: false })
      .eq("user_id", user.id);

    if (clearError) {
      showMessage(
        `Unable to update the primary resume: ${clearError.message}`,
        "error"
      );
      setWorkingResumeId(null);
      return;
    }

    const { error: primaryError } = await supabase
      .from("resumes")
      .update({ is_primary: true })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (primaryError) {
      showMessage(
        `Unable to set the primary resume: ${primaryError.message}`,
        "error"
      );
      setWorkingResumeId(null);
      return;
    }

    showMessage("Primary resume updated.", "success");
    await loadResumes();
    setWorkingResumeId(null);
  }

  async function downloadResume(resume: Resume) {
    if (!resume.file_path) {
      showMessage("This resume does not have a stored file.", "error");
      return;
    }

    setWorkingResumeId(resume.id);
    setMessage("");

    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(resume.file_path, 60);

    if (error || !data?.signedUrl) {
      showMessage(
        `Unable to open the resume: ${
          error?.message ?? "Signed URL was not created."
        }`,
        "error"
      );
      setWorkingResumeId(null);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setWorkingResumeId(null);
  }

  async function parseResume(resume: Resume) {
    setWorkingResumeId(resume.id);
    setMessage("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      showMessage("Please sign in again.", "error");
      setWorkingResumeId(null);
      return;
    }

    try {
      const response = await fetch("/api/agent/parse-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          resume_id: resume.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(
          `Resume parsing failed: ${result.error ?? "Unknown error"}`,
          "error"
        );
        await loadResumes();
        setWorkingResumeId(null);
        return;
      }

      const characterCount =
        typeof result?.resume?.character_count === "number"
          ? result.resume.character_count.toLocaleString()
          : null;

      showMessage(
        characterCount
          ? `Resume parsed successfully — ${characterCount} characters extracted.`
          : "Resume parsed successfully.",
        "success"
      );

      await loadResumes();
    } catch (error) {
      showMessage(
        `Resume parsing failed: ${
          error instanceof Error ? error.message : "Unexpected error"
        }`,
        "error"
      );
    } finally {
      setWorkingResumeId(null);
    }
  }

  async function deleteResume(resume: Resume) {
    const confirmed = window.confirm(
      `Delete "${resume.name}" permanently?`
    );

    if (!confirmed) {
      return;
    }

    setWorkingResumeId(resume.id);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      showMessage("Please sign in again.", "error");
      setWorkingResumeId(null);
      return;
    }

    if (resume.file_path) {
      const { error: storageError } = await supabase.storage
        .from("resumes")
        .remove([resume.file_path]);

      if (storageError) {
        showMessage(
          `File deletion failed: ${storageError.message}`,
          "error"
        );
        setWorkingResumeId(null);
        return;
      }
    }

    const { error: databaseError } = await supabase
      .from("resumes")
      .delete()
      .eq("id", resume.id)
      .eq("user_id", user.id);

    if (databaseError) {
      showMessage(
        `Resume record could not be deleted: ${databaseError.message}`,
        "error"
      );
      setWorkingResumeId(null);
      return;
    }

    const remainingResumes = resumes.filter(
      (item) => item.id !== resume.id
    );

    if (resume.is_primary && remainingResumes.length > 0) {
      const nextPrimary = remainingResumes[0];

      await supabase
        .from("resumes")
        .update({ is_primary: true })
        .eq("id", nextPrimary.id)
        .eq("user_id", user.id);
    }

    showMessage("Resume deleted successfully.", "success");
    await loadResumes();
    setWorkingResumeId(null);
  }

  function formatDate(dateValue: string) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateValue));
  }

  const messageStyles = {
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
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
                Resume Library
              </h1>
            </div>

            <nav className="space-y-2 text-sm">
              <Link
                href="/"
                className="block rounded-lg px-4 py-3 text-slate-300 transition hover:bg-slate-800"
              >
                Dashboard
              </Link>

              <Link
                href="/resumes"
                className="block rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950"
              >
                Resume Library
              </Link>

              <span className="block rounded-lg px-4 py-3 text-slate-500">
                Daily Jobs
              </span>

              <span className="block rounded-lg px-4 py-3 text-slate-500">
                Applications
              </span>

              <span className="block rounded-lg px-4 py-3 text-slate-500">
                Recruiters
              </span>

              <span className="block rounded-lg px-4 py-3 text-slate-500">
                Analytics
              </span>
            </nav>
          </aside>

          <section className="flex-1 p-6 md:p-10">
            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                Cloud Resume Management
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Manage your resume versions
              </h2>

              <p className="mt-2 max-w-3xl text-slate-400">
                Upload separate resumes for Project Management, PMO,
                Service Delivery, Telecom, Cloud, and Operations roles.
              </p>
            </header>

            {message && (
              <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
              >
                {message}
              </div>
            )}

            <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <form
                onSubmit={handleSubmit}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <h3 className="text-xl font-semibold">
                  Upload a Resume
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  The file will be saved privately in Supabase.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <label
                      htmlFor="resumeName"
                      className="mb-2 block text-sm font-medium"
                    >
                      Resume name
                    </label>

                    <input
                      id="resumeName"
                      value={resumeName}
                      onChange={(event) =>
                        setResumeName(event.target.value)
                      }
                      placeholder="Example: Ahamed PM Resume"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="category"
                      className="mb-2 block text-sm font-medium"
                    >
                      Resume category
                    </label>

                    <select
                      id="category"
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    >
                      {resumeCategories.map((resumeCategory) => (
                        <option
                          key={resumeCategory}
                          value={resumeCategory}
                        >
                          {resumeCategory}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="resumeFile"
                      className="mb-2 block text-sm font-medium"
                    >
                      Resume file
                    </label>

                    <input
                      ref={fileInputRef}
                      id="resumeFile"
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileChange}
                      className="w-full rounded-lg border border-dashed border-slate-700 bg-slate-950 px-4 py-4 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:font-semibold file:text-slate-950 hover:file:bg-cyan-400"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      PDF, DOCX or TXT. Maximum file size: 10 MB.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="description"
                      className="mb-2 block text-sm font-medium"
                    >
                      Description
                    </label>

                    <textarea
                      id="description"
                      value={description}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                      placeholder="Example: Best resume for ICT Project Manager roles."
                      rows={4}
                      className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading}
                    className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploading
                      ? "Uploading Resume..."
                      : "Upload Resume"}
                  </button>
                </div>
              </form>

              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">
                      Your Resumes
                    </h3>

                    <p className="text-sm text-slate-400">
                      {resumes.length} resume
                      {resumes.length === 1 ? "" : "s"} stored
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                    Private cloud storage
                  </span>
                </div>

                {isLoading ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center">
                    <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />

                    <p className="mt-4 text-sm text-slate-400">
                      Loading resumes...
                    </p>
                  </div>
                ) : resumes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-10 text-center">
                    <p className="text-lg font-semibold">
                      No resumes uploaded yet
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                      Upload your first resume using the form.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {resumes.map((resume) => (
                      <article
                        key={resume.id}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-5"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-semibold">
                                {resume.name}
                              </h4>

                              {resume.is_primary && (
                                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                                  Primary
                                </span>
                              )}
                            </div>

                            <p className="mt-2 text-sm text-cyan-400">
                              {resume.category}
                            </p>

                            <p className="mt-1 text-sm text-slate-400">
                              File: {resume.file_name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Added: {formatDate(resume.created_at)}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {resume.parsing_status === "completed" ? (
                                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                                  Parsed ✓
                                </span>
                              ) : resume.parsing_status === "processing" ? (
                                <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
                                  Parsing...
                                </span>
                              ) : resume.parsing_status === "failed" ? (
                                <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                                  Parse Failed
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                                  Not Parsed
                                </span>
                              )}

                              {resume.parsed_at && (
                                <span className="text-xs text-slate-500">
                                  Parsed: {formatDate(resume.parsed_at)}
                                </span>
                              )}
                            </div>

                            {resume.parsing_status === "failed" &&
                              resume.parsing_error && (
                                <p className="mt-2 max-w-2xl text-xs text-red-300">
                                  {resume.parsing_error}
                                </p>
                              )}

                            {resume.description && (
                              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                                {resume.description}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={workingResumeId === resume.id}
                              onClick={() => downloadResume(resume)}
                              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                            >
                              Open
                            </button>

                            <button
                              type="button"
                              disabled={workingResumeId === resume.id}
                              onClick={() => parseResume(resume)}
                              className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                            >
                              {workingResumeId === resume.id
                                ? "Working..."
                                : resume.parsing_status === "completed"
                                ? "Re-Parse Resume"
                                : "Parse Resume"}
                            </button>

                            {!resume.is_primary && (
                              <button
                                type="button"
                                disabled={workingResumeId === resume.id}
                                onClick={() =>
                                  makePrimary(resume.id)
                                }
                                className="rounded-lg border border-cyan-500/40 px-3 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-50"
                              >
                                Set Primary
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={workingResumeId === resume.id}
                              onClick={() => deleteResume(resume)}
                              className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Resume files are stored privately in Supabase. Each
              authenticated user can access only their own files and
              resume records.
            </div>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}