"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type KeywordJob = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  country: string;
  source: string;
  job_url: string;
  job_description: string;
  employment_type: string | null;
  salary_text: string | null;
  posted_at: string | null;
  contact_email?: string | null;
  application_method?: "email" | "website" | null;
};

type DateFilter = "all" | "1" | "3" | "5" | "7plus";

export default function KeywordSearchPage() {
  const [query, setQuery] = useState("");
  const [includeSaudi, setIncludeSaudi] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [jobs, setJobs] = useState<KeywordJob[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [emailOnly, setEmailOnly] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const [quickTailorJobKey, setQuickTailorJobKey] = useState<string | null>(null);
  const [quickTailorLoading, setQuickTailorLoading] = useState(false);
  const [quickTailorError, setQuickTailorError] = useState("");
  const [quickTailorResult, setQuickTailorResult] = useState<{
    ats_score: number;
    tailored_resume: string;
    summary: string;
  } | null>(null);
  const [quickTailorApproved, setQuickTailorApproved] = useState(false);
  const [quickTailorDownloading, setQuickTailorDownloading] = useState<"docx" | "pdf" | null>(null);

  function daysSincePosted(value: string | null): number | null {
    if (!value) return null;
    const posted = new Date(value).getTime();
    if (Number.isNaN(posted)) return null;
    return Math.max(0, Math.floor((nowMs - posted) / (1000 * 60 * 60 * 24)));
  }

  function formatRelativeDate(value: string | null) {
    const days = daysSincePosted(value);
    if (days === null) return "Date not verified";
    if (days === 0) return "Posted: Today";
    if (days === 1) return "Posted: Yesterday";
    return `Posted: ${days} days ago`;
  }

  function matchesDateFilter(value: string | null, filter: DateFilter) {
    if (filter === "all") return true;
    const days = daysSincePosted(value);
    if (days === null) return false;
    if (filter === "1") return days <= 1;
    if (filter === "3") return days <= 3;
    if (filter === "5") return days <= 5;
    if (filter === "7plus") return days > 7;
    return true;
  }

  async function runSearch() {
    setSearchError("");

    if (!query.trim()) {
      setSearchError("Enter a keyword to search.");
      return;
    }

    setIsSearching(true);
    setJobs([]);
    setWarnings([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/agent/keyword-search-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          include_saudi: includeSaudi,
          uae_pages: 6,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Search failed.");
      }

      setJobs(result.jobs ?? []);
      setWarnings(result.warnings ?? []);
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Unexpected error while searching."
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function runQuickTailor(job: KeywordJob) {
    setQuickTailorJobKey(job.external_id);
    setQuickTailorLoading(true);
    setQuickTailorError("");
    setQuickTailorResult(null);
    setQuickTailorApproved(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/agent/tailor-resume-for-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: job.title,
          company: job.company,
          job_description: job.job_description ?? "",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Tailoring failed.");
      }

      setQuickTailorResult(result.tailoring);
    } catch (error) {
      setQuickTailorError(
        error instanceof Error ? error.message : "Unexpected error while tailoring."
      );
    } finally {
      setQuickTailorLoading(false);
    }
  }

  function closeQuickTailor() {
    setQuickTailorJobKey(null);
    setQuickTailorResult(null);
    setQuickTailorError("");
    setQuickTailorApproved(false);
  }

  async function downloadQuickTailorResume(format: "docx" | "pdf", role: string, company: string) {
    if (!quickTailorResult?.tailored_resume) return;
    setQuickTailorDownloading(format);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/agent/export-tailored-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          format,
          resume_text: quickTailorResult.tailored_resume,
          role,
          company,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Download failed.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume.${format === "docx" ? "docx" : "pdf"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setQuickTailorError(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setQuickTailorDownloading(null);
    }
  }

  const visibleJobs = jobs
    .filter((job) => matchesDateFilter(job.posted_at, dateFilter))
    .filter((job) => !emailOnly || (job.application_method === "email" && job.contact_email));

  const activeJobForModal = jobs.find((job) => job.external_id === quickTailorJobKey) ?? null;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <h1 className="text-2xl font-bold">Keyword Search</h1>
          <p className="mt-2 text-sm text-slate-400">
            Search any keyword across every connected source — independent of your
            saved profile or resume. No ranking or match scoring here, just the raw
            results, filterable by how recently they were posted.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <label className="text-sm font-medium text-slate-300">Keyword</label>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. Data Analyst, Site Engineer, anything"
                className="flex-1 min-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={isSearching}
                className="rounded-lg bg-purple-500 px-6 py-3 font-semibold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSearching ? "Searching…" : "Search"}
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={includeSaudi}
                onChange={(event) => setIncludeSaudi(event.target.checked)}
                className="h-4 w-4 accent-purple-500"
              />
              Also search Saudi Arabia (UAE is always searched)
            </label>

            {searchError && (
              <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {searchError}
              </p>
            )}

            {warnings.length > 0 && (
              <details className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                <summary className="cursor-pointer font-medium">
                  Source setup notices ({warnings.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {jobs.length > 0 && (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-400">
                  {visibleJobs.length} of {jobs.length} results
                </p>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={emailOnly}
                    onChange={(event) => setEmailOnly(event.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  Email-apply only
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Posted within:</span>
                {([
                  { value: "all", label: "All" },
                  { value: "1", label: "1 Day" },
                  { value: "3", label: "3 Days" },
                  { value: "5", label: "5 Days" },
                  { value: "7plus", label: "7+ Days" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDateFilter(option.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${dateFilter === option.value ? "bg-purple-500 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {visibleJobs.map((job) => (
                  <article key={job.external_id} className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">{job.country}</p>
                    <h3 className="mt-2 font-semibold">{job.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">{job.company}</p>
                    <p className="mt-1 text-xs text-slate-500">{job.location} · {job.source}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatRelativeDate(job.posted_at)}</p>

                    {job.application_method === "email" && job.contact_email && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                          Apply: email
                        </span>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-emerald-200">
                          {job.contact_email}
                        </span>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
                        Review Original Job
                      </a>
                      <button
                        type="button"
                        onClick={() => runQuickTailor(job)}
                        className="inline-flex rounded-lg border border-purple-500 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/10"
                      >
                        Tailor &amp; Download
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        {quickTailorJobKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-purple-500/30 bg-slate-900 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-purple-300">Tailor &amp; Download</p>
                  <h3 className="mt-1 text-lg font-semibold">Review-only mode. Nothing is sent and your original resume is never replaced.</h3>
                </div>
                <button type="button" onClick={closeQuickTailor} className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-400 hover:bg-slate-800">
                  Close
                </button>
              </div>

              {quickTailorLoading && (
                <p className="mt-6 text-sm text-slate-400">Tailoring your resume for this job — this can take 10-20 seconds…</p>
              )}

              {quickTailorError && (
                <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="font-semibold text-red-200">Tailored resume could not be generated</p>
                  <p className="mt-1 text-sm text-red-200">{quickTailorError}</p>
                </div>
              )}

              {quickTailorResult && (
                <div className="mt-6">
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${quickTailorResult.ats_score >= 75 ? "bg-emerald-500/15 text-emerald-300" : quickTailorResult.ats_score >= 50 ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-300"}`}>
                    {quickTailorResult.ats_score}% Match
                  </span>
                  {quickTailorResult.summary && (
                    <p className="mt-3 text-sm text-slate-300">{quickTailorResult.summary}</p>
                  )}
                  <textarea
                    readOnly
                    value={quickTailorResult.tailored_resume}
                    className="mt-4 h-64 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
                  />
                  <label className="mt-4 flex items-start gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={quickTailorApproved}
                      onChange={(event) => setQuickTailorApproved(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-purple-500"
                    />
                    I reviewed this draft against my real experience and approve it for downloading. I will verify it again before applying.
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!quickTailorApproved || quickTailorDownloading !== null}
                      onClick={() => downloadQuickTailorResume("docx", activeJobForModal?.title ?? "Role", activeJobForModal?.company ?? "Company")}
                      className="rounded-lg border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {quickTailorDownloading === "docx" ? "Downloading…" : "Download Word"}
                    </button>
                    <button
                      type="button"
                      disabled={!quickTailorApproved || quickTailorDownloading !== null}
                      onClick={() => downloadQuickTailorResume("pdf", activeJobForModal?.title ?? "Role", activeJobForModal?.company ?? "Company")}
                      className="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {quickTailorDownloading === "pdf" ? "Downloading…" : "Download PDF"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Next step: tap &quot;Review Original Job&quot; on the card, then upload this file when the site asks for your resume.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
