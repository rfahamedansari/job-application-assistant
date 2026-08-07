"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import AuthGuard from "@/components/AuthGuard";
import { calculateJobMatch } from "@/lib/jobMatch";
import { supabase } from "@/lib/supabase";

type Profile = {
  target_categories?: string[];
  target_roles?: string[];
  preferred_countries?: string[];
  preferred_cities?: string[];
  skills?: string[];
  include_keywords?: string[];
  exclude_keywords?: string[];
  experience_years?: number | null;
};

type Resume = {
  id: string;
  name: string;
  category: string;
  is_primary?: boolean;
};

type Job = {
  id: string;
  created_by: string | null;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  category: string | null;
  source: string;
  job_url: string;
  job_description: string | null;
  employment_type: string | null;
  salary_text: string | null;
  posted_at: string | null;
  collected_at: string;
  created_at: string;
};

const sourceOptions = [
  "LinkedIn",
  "Indeed",
  "NaukriGulf",
  "Bayt",
  "GulfTalent",
  "Company Website",
  "Recruiter",
  "Manual",
];

const categoryOptions = [
  "Project Management",
  "PMO",
  "Service Delivery",
  "Telecom",
  "Operations",
  "Cloud",
  "Network Infrastructure",
  "General",
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] =
    useState("Project Management");
  const [source, setSource] = useState("LinkedIn");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [employmentType, setEmploymentType] =
    useState("Full-time");
  const [salaryText, setSalaryText] = useState("");
  const [postedDate, setPostedDate] = useState("");

  const [searchText, setSearchText] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] =
    useState("All");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | "info"
  >("info");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [applyingJobId, setApplyingJobId] =
    useState<string | null>(null);

  const [appliedJobIds, setAppliedJobIds] =
    useState<string[]>([]);

  const loadJobs = useCallback(async () => {
    setIsLoading(true);

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

    // Load profile
    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select(`
          target_categories,
          target_roles,
          preferred_countries,
          preferred_cities,
          skills,
          include_keywords,
          exclude_keywords,
          experience_years
        `)
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      setMessage(
        `Unable to load profile: ${profileError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setProfile(profileData as Profile | null);

    // Load resumes
    const { data: resumeData, error: resumeError } =
      await supabase
        .from("resumes")
        .select("id, name, category, is_primary")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

    if (resumeError) {
      setMessage(
        `Unable to load resumes: ${resumeError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setResumes((resumeData ?? []) as Resume[]);

    // Load jobs
    const { data: jobsData, error: jobsError } =
      await supabase
        .from("jobs")
        .select("*")
        .order("posted_at", {
          ascending: false,
          nullsFirst: false,
        })
        .order("created_at", { ascending: false });

    if (jobsError) {
      setMessage(
        `Unable to load jobs: ${jobsError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setJobs((jobsData ?? []) as Job[]);

    // Load existing applications
    const {
      data: applicationData,
      error: applicationError,
    } = await supabase
      .from("applications")
      .select("job_id")
      .eq("user_id", user.id);

    if (applicationError) {
      setMessage(
        `Unable to load applications: ${applicationError.message}`
      );
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    const ids = (applicationData ?? [])
      .map((item) => item.job_id)
      .filter((id): id is string => Boolean(id));

    setAppliedJobIds(ids);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (!title.trim()) {
      setMessage("Please enter the job title.");
      setMessageType("error");
      return;
    }

    if (!company.trim()) {
      setMessage("Please enter the company name.");
      setMessageType("error");
      return;
    }

    if (!jobUrl.trim()) {
      setMessage("Please enter the original job link.");
      setMessageType("error");
      return;
    }

    try {
      new URL(jobUrl.trim());
    } catch {
      setMessage(
        "Please enter a complete link starting with http:// or https://."
      );
      setMessageType("error");
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage(
        "Your session expired. Please sign in again."
      );
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.from("jobs").insert({
      created_by: user.id,
      title: title.trim(),
      company: company.trim(),
      location: location.trim() || null,
      country: country.trim() || null,
      category,
      source,
      job_url: jobUrl.trim(),
      job_description:
        jobDescription.trim() || null,
      employment_type: employmentType || null,
      salary_text: salaryText.trim() || null,
      posted_at: postedDate
        ? new Date(
            `${postedDate}T00:00:00`
          ).toISOString()
        : null,
    });

    if (error) {
      setMessage(
        `Job could not be saved: ${error.message}`
      );
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setTitle("");
    setCompany("");
    setLocation("");
    setCountry("");
    setCategory("Project Management");
    setSource("LinkedIn");
    setJobUrl("");
    setJobDescription("");
    setEmploymentType("Full-time");
    setSalaryText("");
    setPostedDate("");

    setMessage("Job added successfully.");
    setMessageType("success");

    await loadJobs();
    setIsSaving(false);
  }

  async function markAsApplied(
    job: Job,
    recommendedResumeId: string | null
  ) {
    if (appliedJobIds.includes(job.id)) {
      setMessage("This job is already in Applications.");
      setMessageType("info");
      return;
    }

    setApplyingJobId(job.id);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage(
        "Your session expired. Please sign in again."
      );
      setMessageType("error");
      setApplyingJobId(null);
      return;
    }

    const { error } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        job_id: job.id,
        resume_id: recommendedResumeId,
        role: job.title,
        company: job.company,
        source: job.source,
        job_url: job.job_url,
        status: "Applied",
        applied_at: new Date().toISOString(),
      });

    if (error) {
      setMessage(
        `Application could not be saved: ${error.message}`
      );
      setMessageType("error");
      setApplyingJobId(null);
      return;
    }

    setAppliedJobIds((current) => [
      ...current,
      job.id,
    ]);

    setMessage(
      `${job.title} added to Applications.`
    );
    setMessageType("success");

    setApplyingJobId(null);
  }

  const filteredJobs = jobs.filter((job) => {
    const searchableText = [
      job.title,
      job.company,
      job.location,
      job.country,
      job.category,
      job.source,
      job.job_description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      searchableText.includes(
        searchText.trim().toLowerCase()
      );

    const matchesSource =
      sourceFilter === "All" ||
      job.source === sourceFilter;

    const matchesCategory =
      categoryFilter === "All" ||
      job.category === categoryFilter;

    return (
      matchesSearch &&
      matchesSource &&
      matchesCategory
    );
  });

  function formatDate(value: string | null) {
    if (!value) {
      return "Date not available";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }

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

          {/* SIDEBAR */}
          <aside className="hidden w-64 border-r border-slate-800 bg-slate-900 p-6 lg:block">

            <div className="mb-10">
              <p className="text-sm font-medium text-cyan-400">
                Ahamed AI Career OS
              </p>

              <h1 className="mt-2 text-2xl font-bold">
                Jobs
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
                className="block rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950"
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
                href="/profile"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Profile & Preferences
              </Link>

              <Link
                href="/applications"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Applications
              </Link>

            </nav>
          </aside>

          {/* MAIN */}
          <section className="flex-1 p-6 md:p-10">

            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                AI Job Matching
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Jobs from all your sources
              </h2>

              <p className="mt-2 max-w-3xl text-slate-400">
                Add vacancies, compare them with your
                profile and resumes, and track the jobs
                you apply for.
              </p>
            </header>

            {message && (
              <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
              >
                {message}
              </div>
            )}

            <section className="grid gap-6 xl:grid-cols-[390px_1fr]">

              {/* ADD JOB */}
              <form
                onSubmit={handleSubmit}
                className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >

                <h3 className="text-xl font-semibold">
                  Add a Job
                </h3>

                <div className="mt-6 space-y-4">

                  <input
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Job title"
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
                    value={location}
                    onChange={(event) =>
                      setLocation(event.target.value)
                    }
                    placeholder="Location"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    value={country}
                    onChange={(event) =>
                      setCountry(event.target.value)
                    }
                    placeholder="Country"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <select
                    value={source}
                    onChange={(event) =>
                      setSource(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    {sourceOptions.map((option) => (
                      <option key={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(event) =>
                      setJobUrl(event.target.value)
                    }
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <select
                    value={employmentType}
                    onChange={(event) =>
                      setEmploymentType(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  >
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Temporary</option>
                    <option>Internship</option>
                    <option>Not specified</option>
                  </select>

                  <input
                    value={salaryText}
                    onChange={(event) =>
                      setSalaryText(
                        event.target.value
                      )
                    }
                    placeholder="Salary"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <input
                    type="date"
                    value={postedDate}
                    onChange={(event) =>
                      setPostedDate(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <textarea
                    value={jobDescription}
                    onChange={(event) =>
                      setJobDescription(
                        event.target.value
                      )
                    }
                    placeholder="Paste job description"
                    rows={7}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                  />

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                  >
                    {isSaving
                      ? "Saving..."
                      : "Add Job"}
                  </button>

                </div>
              </form>

              {/* JOBS */}
              <section>

                {/* FILTERS */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

                  <div className="grid gap-4 md:grid-cols-3">

                    <input
                      value={searchText}
                      onChange={(event) =>
                        setSearchText(
                          event.target.value
                        )
                      }
                      placeholder="Search jobs"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                    />

                    <select
                      value={sourceFilter}
                      onChange={(event) =>
                        setSourceFilter(
                          event.target.value
                        )
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                    >
                      <option>All</option>

                      {sourceOptions.map((option) => (
                        <option key={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    <select
                      value={categoryFilter}
                      onChange={(event) =>
                        setCategoryFilter(
                          event.target.value
                        )
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                    >
                      <option>All</option>

                      {categoryOptions.map((option) => (
                        <option key={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                  </div>
                </div>

                <div className="mt-5 space-y-4">

                  {isLoading ? (
                    <div className="rounded-2xl bg-slate-900 p-10 text-center">
                      Loading jobs...
                    </div>
                  ) : filteredJobs.length === 0 ? (
                    <div className="rounded-2xl bg-slate-900 p-10 text-center">
                      No jobs found
                    </div>
                  ) : (
                    filteredJobs.map((job) => {

                      const match = profile
                        ? calculateJobMatch(
                            profile,
                            job,
                            resumes
                          )
                        : null;

                      const alreadyApplied =
                        appliedJobIds.includes(job.id);

                      return (
                        <article
                          key={job.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                        >

                          <h3 className="text-xl font-semibold">
                            {job.title}
                          </h3>

                          <p className="mt-1 text-slate-300">
                            {job.company}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {[job.location, job.country]
                              .filter(Boolean)
                              .join(", ")}
                          </p>

                          <p className="mt-3 text-sm text-cyan-400">
                            {job.source}
                          </p>

                          <p className="mt-3 text-xs text-slate-500">
                            Posted:{" "}
                            {formatDate(job.posted_at)}
                          </p>

                          {/* MATCH */}
                          {match && (
                            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">

                              <div className="flex flex-wrap gap-3">

                                <span
                                  className={`rounded-full px-3 py-1 text-sm font-bold ${
                                    match.score >= 75
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : match.score >= 50
                                      ? "bg-amber-500/15 text-amber-300"
                                      : "bg-red-500/15 text-red-300"
                                  }`}
                                >
                                  {match.score}% Match
                                </span>

                                <span className="text-sm text-slate-300">
                                  {match.level}
                                </span>

                              </div>

                              {match.recommendedResumeName && (
                                <div className="mt-4 rounded-lg bg-cyan-500/5 p-3">

                                  <p className="text-xs text-slate-500">
                                    Recommended Resume
                                  </p>

                                  <p className="mt-1 font-semibold text-cyan-400">
                                    {
                                      match.recommendedResumeName
                                    }
                                  </p>

                                </div>
                              )}

                              {match.reasons.length > 0 && (
                                <div className="mt-4">

                                  <p className="text-sm font-semibold">
                                    Why it matches
                                  </p>

                                  {match.reasons
                                    .slice(0, 5)
                                    .map((reason) => (
                                      <p
                                        key={reason}
                                        className="mt-1 text-sm text-emerald-300"
                                      >
                                        ✓ {reason}
                                      </p>
                                    ))}

                                </div>
                              )}

                              {match.missingSkills.length > 0 && (
                                <div className="mt-4">

                                  <p className="text-sm font-semibold">
                                    Missing skills
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">

                                    {match.missingSkills
                                      .slice(0, 6)
                                      .map((skill) => (
                                        <span
                                          key={skill}
                                          className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300"
                                        >
                                          {skill}
                                        </span>
                                      ))}

                                  </div>
                                </div>
                              )}

                            </div>
                          )}

                          {job.job_description && (
                            <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-300">
                              {job.job_description}
                            </p>
                          )}

                          {/* BUTTONS */}
                          <div className="mt-5 flex flex-wrap gap-3">

                            <a
                              href={job.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
                            >
                              Open Original Job
                            </a>

                            <button
                              type="button"
                              disabled={
                                alreadyApplied ||
                                applyingJobId === job.id
                              }
                              onClick={() =>
                                markAsApplied(
                                  job,
                                  match?.recommendedResumeId ??
                                    null
                                )
                              }
                              className={`rounded-lg px-5 py-3 font-semibold ${
                                alreadyApplied
                                  ? "cursor-not-allowed bg-emerald-500/10 text-emerald-400"
                                  : "border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                              }`}
                            >

                              {alreadyApplied
                                ? "✓ Applied"
                                : applyingJobId === job.id
                                ? "Saving..."
                                : "Mark as Applied"}

                            </button>

                          </div>

                        </article>
                      );
                    })
                  )}

                </div>
              </section>

            </section>
          </section>

        </div>
      </main>
    </AuthGuard>
  );
}