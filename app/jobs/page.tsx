"use client";

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
  source_type?: string | null;
  application_method?: string | null;
  contact_email?: string | null;
  recruiter_name?: string | null;
  source_post_text?: string | null;
  agent_status?: string | null;
};

type AiProcessedJob = {
  title: string;
  company: string;
  location: string;
  country: string;
  category: string;
  source: string;
  job_url: string;
  job_description: string;
  employment_type: string;
  salary_text: string;
  posted_at: string | null;
  source_type: "formal_job" | "recruiter_post";
  application_method: "website" | "email" | "manual";
  contact_email: string;
  recruiter_name: string;
  source_post_text: string;
  agent_notes: string;
  skills?: string[];
  requirements?: string[];
};
type RealAtsMatch = {
  job_id: string;
  job_title: string;
  company: string;
  resume_id: string;
  resume_name: string;
  overall_score: number;
  level: string;
  matched_skills: string[];
  missing_skills: string[];
  matched_certifications: string[];
  missing_certifications: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  strengths: string[];
  gaps: string[];
  experience_alignment: string;
  role_alignment: string;
  ats_notes: string[];
  tailoring_recommendations: string[];
  summary: string;
};

type BestResumeRanking = {
  resume_id: string;
  resume_name: string;
  resume_category: string;
  score: number;
  level: string;
  strongest_matches: string[];
  important_gaps: string[];
  reason: string;
};

type BestResumeResult = {
  job: {
    id: string;
    title: string;
    company: string;
  };
  best_resume: {
    resume_id: string;
    resume_name: string;
    resume_category: string;
    score: number;
    level: string;
  };
  selection_reason: string;
  rankings: BestResumeRanking[];
};

type DateFilter = "all" | "1" | "3" | "5" | "7plus";

type CollectedTopJob = Job & {
  external_id: string;
  match: {
    score: number;
    level: string;
    reasons: string[];
    missingSkills: string[];
    recommendedResumeId: string | null;
    recommendedResumeName: string | null;
  };
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

  const [rawJobText, setRawJobText] = useState("");
  const [aiSource, setAiSource] = useState("LinkedIn");
  const [aiJobUrl, setAiJobUrl] = useState("");
  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [isSavingProcessedJob, setIsSavingProcessedJob] = useState(false);
  const [processedJob, setProcessedJob] =
    useState<AiProcessedJob | null>(null);
    const [atsLoadingJobId, setAtsLoadingJobId] =
  useState<string | null>(null);

const [realAtsResults, setRealAtsResults] =
  useState<Record<string, RealAtsMatch>>({});

const [bestResumeLoadingJobId, setBestResumeLoadingJobId] =
  useState<string | null>(null);

const [bestResumeResults, setBestResumeResults] =
  useState<Record<string, BestResumeResult>>({});

  const [topCollectedJobs, setTopCollectedJobs] = useState<CollectedTopJob[]>([]);
  const [allCollectedJobs, setAllCollectedJobs] = useState<CollectedTopJob[]>([]);
  const [jobSearchQuery, setJobSearchQuery] = useState("Project Manager");
  const [jobSearchUaePages, setJobSearchUaePages] = useState(6);
  const [includeSaudiJobs, setIncludeSaudiJobs] = useState(false);
  const [includeQatarJobs, setIncludeQatarJobs] = useState(false);
  const [includeOmanJobs, setIncludeOmanJobs] = useState(false);
  const [showAllCollectedJobs, setShowAllCollectedJobs] = useState(false);
  const [showEmailCollectedJobs, setShowEmailCollectedJobs] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  // Computed once via lazy initializer (not on every render) so the "days
  // since posted" math stays pure during render, per React's rules.
  const [nowMs] = useState(() => Date.now());
  const [isCollectingJobs, setIsCollectingJobs] = useState(false);
  const [collectionWarnings, setCollectionWarnings] = useState<string[]>([]);

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

  async function processRawJob() {
    setMessage("");
    setProcessedJob(null);

    if (!rawJobText.trim()) {
      setMessage("Paste a job description or recruiter post first.");
      setMessageType("error");
      return;
    }

    setIsProcessingJob(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/agent/process-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          raw_text: rawJobText.trim(),
          source: aiSource,
          job_url: aiJobUrl.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          `AI processing failed: ${
            result.error ?? "Unknown error"
          }`
        );
        setMessageType("error");
        return;
      }

      setProcessedJob(result.job as AiProcessedJob);
      setMessage(
        "AI analysis complete. Review the extracted details before saving."
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        `AI processing failed: ${
          error instanceof Error
            ? error.message
            : "Unexpected error"
        }`
      );
      setMessageType("error");
    } finally {
      setIsProcessingJob(false);
    }
  }

  async function saveProcessedJob() {
    if (!processedJob) return;

    if (!processedJob.title?.trim()) {
      setMessage("AI could not identify the job title. Please use Add a Job.");
      setMessageType("error");
      return;
    }

    if (!processedJob.company?.trim()) {
      setMessage(
        "AI could not identify the company. Please verify the post and use Add a Job if needed."
      );
      setMessageType("error");
      return;
    }

    setIsSavingProcessedJob(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please sign in again.");
        setMessageType("error");
        return;
      }

      const response = await fetch("/api/agent/ingest-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(processedJob),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          `Processed job could not be saved: ${
            result.error ?? "Unknown error"
          }`
        );
        setMessageType("error");
        return;
      }

      // The job itself is already saved at this point (ingest-job
      // succeeded above). The email-application step below is a separate,
      // secondary write. Its own try/catch keeps a failure here from being
      // mislabeled as "the job could not be saved" — that message is
      // misleading and previously also skipped resetting the form and
      // reloading the jobs list, making a successful save look like it
      // silently disappeared.
      if (processedJob.application_method === "email" && processedJob.contact_email && result.job?.id) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Your session has expired. Please sign in again.");
          const { error: applicationError } = await supabase.from("applications").insert({
            user_id: user.id,
            job_id: result.job.id,
            resume_id: null,
            role: processedJob.title,
            company: processedJob.company,
            source: processedJob.source,
            job_url: processedJob.job_url,
            status: "Ready for Review",
            // The current database schema requires this timestamp even before
            // submission. Status remains "Ready for Review", so it is not
            // counted or presented as an applied vacancy.
            applied_at: new Date().toISOString(),
          });
          if (applicationError) {
            throw new Error(applicationError.message);
          }
          setMessage("Email vacancy saved to Applications → Email Applications for resume and email approval.");
          setMessageType("success");
        } catch (applicationCreationError) {
          setMessage(
            `Job saved successfully, but the email approval queue entry could not be created: ${
              applicationCreationError instanceof Error
                ? applicationCreationError.message
                : "Unexpected error"
            }. Open the job in Daily Jobs and use "Mark as Applied" to add it to Applications manually.`
          );
          setMessageType("error");
        }
      } else {
        setMessage(
          "Processed job saved successfully. Your existing match engine will score it below."
        );
        setMessageType("success");
      }
      setRawJobText("");
      setAiJobUrl("");
      setProcessedJob(null);
      await loadJobs();
    } catch (error) {
      setMessage(
        `Processed job could not be saved: ${
          error instanceof Error
            ? error.message
            : "Unexpected error"
        }`
      );
      setMessageType("error");
    } finally {
      setIsSavingProcessedJob(false);
    }
  }
async function runRealAtsMatch(
  job: Job,
  recommendedResumeId: string | null
) {
  setMessage("");

  const resumeId =
    recommendedResumeId ??
    resumes.find((resume) => resume.is_primary)?.id ??
    resumes[0]?.id;

  if (!resumeId) {
    setMessage(
      "No resume is available. Upload and parse a resume first."
    );
    setMessageType("error");
    return;
  }

  setAtsLoadingJobId(job.id);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setMessage("Please sign in again.");
      setMessageType("error");
      return;
    }

    const response = await fetch("/api/agent/match-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        job_id: job.id,
        resume_id: resumeId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        `Real ATS match failed: ${
          result.error ?? "Unknown error"
        }`
      );
      setMessageType("error");
      return;
    }

    setRealAtsResults((current) => ({
      ...current,
      [job.id]: result.match as RealAtsMatch,
    }));

    setMessage(
      `Real ATS analysis completed for ${job.title}.`
    );
    setMessageType("success");
  } catch (error) {
    setMessage(
      `Real ATS match failed: ${
        error instanceof Error
          ? error.message
          : "Unexpected error"
      }`
    );
    setMessageType("error");
  } finally {
    setAtsLoadingJobId(null);
  }
}

async function compareAllResumes(job: Job) {
  setMessage("");
  setBestResumeLoadingJobId(job.id);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setMessage("Please sign in again.");
      setMessageType("error");
      return;
    }

    const response = await fetch("/api/agent/select-best-resume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        job_id: job.id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        `Resume comparison failed: ${
          result.error ?? "Unknown error"
        }`
      );
      setMessageType("error");
      return;
    }

    setBestResumeResults((current) => ({
      ...current,
      [job.id]: result as BestResumeResult,
    }));

    setMessage(
      `Best resume selected for ${job.title}: ${
        result.best_resume?.resume_name ?? "Resume"
      }.`
    );
    setMessageType("success");
  } catch (error) {
    setMessage(
      `Resume comparison failed: ${
        error instanceof Error
          ? error.message
          : "Unexpected error"
      }`
    );
    setMessageType("error");
  } finally {
    setBestResumeLoadingJobId(null);
  }
}

async function collectTopJobs() {
  setMessage("");
  setIsCollectingJobs(true);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Please sign in again.");
      setMessageType("error");
      return;
    }

    const response = await fetch("/api/agent/collect-jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: jobSearchQuery.trim() || "Project Manager",
        uae_pages: jobSearchUaePages,
        include_saudi: includeSaudiJobs,
        include_qatar: includeQatarJobs,
        include_oman: includeOmanJobs,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(`Job collection failed: ${result.error ?? "Unknown error"}`);
      setMessageType("error");
      return;
    }

    setTopCollectedJobs(result.jobs ?? []);
    setAllCollectedJobs(result.all_jobs ?? result.jobs ?? []);
    setShowAllCollectedJobs(false);
    setShowEmailCollectedJobs(false);
    setCollectionWarnings(result.warnings ?? []);
    setMessage(
      result.jobs?.length
        ? `Collected ${result.collected_count} vacancies for “${result.query}” and ranked your Top ${result.jobs.length}.`
        : "No matching UAE or Saudi vacancies were returned today. Try again later or configure the optional job-source keys."
    );
    setMessageType(result.jobs?.length ? "success" : "info");
  } catch (error) {
    setMessage(`Job collection failed: ${error instanceof Error ? error.message : "Unexpected error"}`);
    setMessageType("error");
  } finally {
    setIsCollectingJobs(false);
  }
}

function reviewCollectedEmailJob(job: CollectedTopJob) {
  setProcessedJob({
    title: job.title,
    company: job.company,
    location: job.location ?? "",
    country: job.country ?? "",
    category: job.category ?? (jobSearchQuery.trim() || "General"),
    source: job.source,
    job_url: job.job_url,
    job_description: job.job_description ?? "",
    employment_type: job.employment_type ?? "",
    salary_text: job.salary_text ?? "",
    posted_at: job.posted_at,
    source_type: job.source_type === "recruiter_post" ? "recruiter_post" : "formal_job",
    application_method: "email",
    contact_email: job.contact_email ?? "",
    recruiter_name: job.recruiter_name ?? "",
    source_post_text: job.job_description ?? "",
    agent_notes: "Automatically discovered email-application vacancy. Review all details before saving.",
  });
  setRawJobText(job.job_description ?? "");
  setAiSource(job.source);
  setAiJobUrl(job.job_url);
  setMessage("Email vacancy loaded for review. Verify the recipient and job details, then save it.");
  setMessageType("info");
  window.setTimeout(() => document.getElementById("agentic-job-processor")?.scrollIntoView({ behavior: "smooth" }), 0);
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

    const matchesDate = matchesDateFilter(job.posted_at, dateFilter);

    return (
      matchesSearch &&
      matchesSource &&
      matchesCategory &&
      matchesDate
    );
  });

  function daysSincePosted(value: string | null): number | null {
    if (!value) return null;
    const posted = new Date(value).getTime();
    if (Number.isNaN(posted)) return null;
    const diffMs = nowMs - posted;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
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
    // Jobs with no reliable posted date are excluded from every specific
    // date bucket (they can't be verified as recent), but still show up
    // under "All".
    if (days === null) return false;
    if (filter === "1") return days <= 1;
    if (filter === "3") return days <= 3;
    if (filter === "5") return days <= 5;
    if (filter === "7plus") return days > 7;
    return true;
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
        <div className="mx-auto min-h-screen max-w-7xl">
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
                Paste vacancies or recruiter posts, let AI extract the
                details, review them, then save and match them against
                your profile and resumes.
              </p>
            </header>

            {message && (
              <div
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
              >
                {message}
              </div>
            )}

            <section className="mb-6 rounded-2xl border border-purple-500/30 bg-slate-900 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-purple-300">Daily Vacancy Agent</p>
                  <h3 className="mt-1 text-xl font-semibold">Search UAE + Saudi Jobs</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    Enter any role, collect permitted live vacancies, remove duplicates, and rank the best opportunities against your profile. Auto Apply is OFF and nothing is submitted.
                  </p>
                </div>
                <div className="w-full max-w-md space-y-2">
                  <label htmlFor="job-search-query" className="block text-sm font-medium text-slate-200">
                    Job title or role
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="job-search-query"
                      value={jobSearchQuery}
                      onChange={(event) => setJobSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !isCollectingJobs) void collectTopJobs();
                      }}
                      maxLength={80}
                      placeholder="Project Manager, Service Delivery, Telecom..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder:text-slate-500"
                    />
                    <select
                      value={jobSearchUaePages}
                      onChange={(event) => setJobSearchUaePages(Number(event.target.value))}
                      aria-label="Maximum UAE jobs to collect"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white"
                    >
                      <option value={2}>Up to 20 UAE jobs</option>
                      <option value={4}>Up to 40 UAE jobs</option>
                      <option value={6}>Up to 60 UAE jobs</option>
                    </select>
                    <button
                      type="button"
                      onClick={collectTopJobs}
                      disabled={isCollectingJobs || !jobSearchQuery.trim()}
                      className="shrink-0 rounded-lg bg-purple-500 px-5 py-3 font-semibold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCollectingJobs ? "Ranking..." : "Search & Rank"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailCollectedJobs(true);
                        setShowAllCollectedJobs(false);
                      }}
                      className={`shrink-0 rounded-lg px-5 py-3 font-semibold ${showEmailCollectedJobs ? "bg-emerald-500 text-slate-950" : "border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"}`}
                    >
                      Email Vacancies ({allCollectedJobs.filter((job) => job.application_method === "email" && job.contact_email).length})
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Examples: Project Manager, Service Delivery Manager, Telecom Manager, Operations Manager, PMO, Cloud Service Manager.
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                    <span className="font-medium text-emerald-300">UAE priority: always searched first</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeSaudiJobs}
                        onChange={(event) => setIncludeSaudiJobs(event.target.checked)}
                        className="h-4 w-4 accent-purple-500"
                      />
                      Add Saudi Arabia (up to 10 jobs)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeQatarJobs}
                        onChange={(event) => setIncludeQatarJobs(event.target.checked)}
                        className="h-4 w-4 accent-purple-500"
                      />
                      Add Qatar (up to 10 jobs)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeOmanJobs}
                        onChange={(event) => setIncludeOmanJobs(event.target.checked)}
                        className="h-4 w-4 accent-purple-500"
                      />
                      Add Oman (up to 10 jobs)
                    </label>
                  </div>
                  <p className="text-xs text-amber-200">
                    UAE uses the selected JSearch pages first. Each optional country uses one additional API credit and runs afterward.
                  </p>
                </div>
              </div>

              {collectionWarnings.length > 0 && (
                <details className="mt-4 text-xs text-amber-200">
                  <summary className="cursor-pointer">Source setup notices ({collectionWarnings.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {collectionWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </details>
              )}

              {showEmailCollectedJobs && topCollectedJobs.length === 0 && (
                <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                  No email vacancies are loaded yet. Run Search &amp; Rank above, or paste a LinkedIn, NaukriGulf, Indeed, or recruiter post in the processor below. Posts containing an application email will appear here after review.
                </div>
              )}

              {topCollectedJobs.length > 0 && (
                <>
                  <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Collected job view">
                    <button
                      type="button"
                      onClick={() => { setShowAllCollectedJobs(false); setShowEmailCollectedJobs(false); }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold ${!showAllCollectedJobs && !showEmailCollectedJobs ? "bg-purple-500 text-white" : "border border-slate-700 text-slate-300"}`}
                    >
                      Top 10 Ranked ({topCollectedJobs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAllCollectedJobs(true); setShowEmailCollectedJobs(false); }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold ${showAllCollectedJobs && !showEmailCollectedJobs ? "bg-cyan-500 text-slate-950" : "border border-slate-700 text-slate-300"}`}
                    >
                      All Jobs ({allCollectedJobs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowEmailCollectedJobs(true); setShowAllCollectedJobs(false); }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold ${showEmailCollectedJobs ? "bg-emerald-500 text-slate-950" : "border border-emerald-500/40 text-emerald-300"}`}
                    >
                      Email Apply ({allCollectedJobs.filter((job) => job.application_method === "email" && job.contact_email).length})
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Rankings are profile-based suggestions. Use Review Original Job to verify the vacancy before applying.
                  </p>
                  {showEmailCollectedJobs && allCollectedJobs.every((job) => job.application_method !== "email" || !job.contact_email) && (
                    <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                      No email-application vacancies were exposed by today&apos;s provider results. You can still paste a recruiter post below for AI extraction.
                    </p>
                  )}
                <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Posted-date filter">
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
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {(showEmailCollectedJobs
                    ? allCollectedJobs.filter((job) => job.application_method === "email" && job.contact_email)
                    : showAllCollectedJobs ? allCollectedJobs : topCollectedJobs
                  ).filter((job) => matchesDateFilter(job.posted_at, dateFilter)).map((job, index) => (
                    <article key={job.external_id} className="rounded-xl border border-slate-700 bg-slate-950 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">#{index + 1} · {job.country}</p>
                          <h4 className="mt-2 font-semibold">{job.title}</h4>
                          <p className="mt-1 text-sm text-slate-300">{job.company}</p>
                          <p className="mt-1 text-xs text-slate-500">{job.location || job.country} · {job.source}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatRelativeDate(job.posted_at)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${job.match.score >= 75 ? "bg-emerald-500/15 text-emerald-300" : job.match.score >= 50 ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-300"}`}>
                          {job.match.score}%
                        </span>
                      </div>
                      {job.match.reasons.length > 0 && (
                        <p className="mt-3 text-xs leading-5 text-emerald-300">✓ {job.match.reasons.slice(0, 2).join(" · ")}</p>
                      )}
                      <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
                        Review Original Job
                      </a>
                      {job.application_method === "email" && job.contact_email && (
                        <button
                          type="button"
                          onClick={() => reviewCollectedEmailJob(job)}
                          className="ml-2 mt-4 inline-flex rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10"
                        >
                          Review Email Vacancy
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                </>
              )}
            </section>

            <section id="agentic-job-processor" className="mb-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-cyan-400">
                    Agentic Job Processor
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">
                    Paste a job post and let AI structure it
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    Works with normal vacancies and recruiter/social posts, including
                    posts that ask you to send a CV by email. Nothing is saved until
                    you review the extracted details and click Save Processed Job.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <select
                  value={aiSource}
                  onChange={(event) => setAiSource(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {sourceOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>

                <input
                  type="url"
                  value={aiJobUrl}
                  onChange={(event) => setAiJobUrl(event.target.value)}
                  placeholder="Original job/post URL (optional)"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </div>

              <textarea
                value={rawJobText}
                onChange={(event) => setRawJobText(event.target.value)}
                placeholder="Paste the complete job description or recruiter post here..."
                rows={10}
                className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
              />

              <button
                type="button"
                onClick={processRawJob}
                disabled={isProcessingJob}
                className="mt-4 rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessingJob ? "Analyzing with AI..." : "Analyze Job with AI"}
              </button>

              {processedJob && (
                <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        AI Preview — review before saving
                      </p>
                      <h4 className="mt-1 text-xl font-semibold">
                        {processedJob.title || "Title not identified"}
                      </h4>
                      <p className="mt-1 text-slate-300">
                        {processedJob.company || "Company not identified"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-300">
                        {processedJob.source_type === "recruiter_post"
                          ? "Recruiter Post"
                          : "Formal Job"}
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                        Apply: {processedJob.application_method || "unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-500">Location</p>
                      <p className="mt-1 text-sm">
                        {[processedJob.location, processedJob.country]
                          .filter(Boolean)
                          .join(", ") || "Not identified"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-500">Category</p>
                      <p className="mt-1 text-sm">
                        {processedJob.category || "General"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-500">Recruiter</p>
                      <p className="mt-1 text-sm">
                        {processedJob.recruiter_name || "Not identified"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-500">Contact email</p>
                      <p className="mt-1 break-all text-sm text-cyan-300">
                        {processedJob.contact_email || "Not identified"}
                      </p>
                    </div>
                  </div>

                  {processedJob.skills && processedJob.skills.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold">Extracted skills</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {processedJob.skills.slice(0, 12).map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {processedJob.job_description && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold">Processed description</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {processedJob.job_description}
                      </p>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={saveProcessedJob}
                      disabled={isSavingProcessedJob}
                      className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingProcessedJob
                        ? "Saving..."
                        : "Save Processed Job"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setProcessedJob(null)}
                      className="rounded-lg border border-slate-600 px-5 py-3 text-slate-300 hover:bg-slate-800"
                    >
                      Discard Preview
                    </button>
                  </div>
                </div>
              )}
            </section>

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
                  <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Posted-date filter">
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
                        const realAtsResult =
  realAtsResults[job.id];
                        const bestResumeResult =
  bestResumeResults[job.id];

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
                            {formatRelativeDate(job.posted_at)}
                          </p>

                          {(job.source_type || job.application_method || job.contact_email) && (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              {job.source_type && (
                                <span className="rounded-full bg-slate-950 px-3 py-1 text-slate-300">
                                  {job.source_type === "recruiter_post"
                                    ? "Recruiter Post"
                                    : "Formal Job"}
                                </span>
                              )}
                              {job.application_method && (
                                <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-300">
                                  Apply: {job.application_method}
                                </span>
                              )}
                              {job.contact_email && (
                                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                                  {job.contact_email}
                                </span>
                              )}
                            </div>
                          )}

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
                            <button
                              type="button"
                              onClick={() => compareAllResumes(job)}
                              disabled={bestResumeLoadingJobId === job.id}
                              className="rounded-lg border border-cyan-500/40 px-5 py-3 font-semibold text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {bestResumeLoadingJobId === job.id
                                ? "Comparing Resumes..."
                                : "Compare All Resumes"}
                            </button>

                            <button
  type="button"
  onClick={() =>
    runRealAtsMatch(
      job,
      bestResumeResult?.best_resume.resume_id ??
        match?.recommendedResumeId ??
        null
    )
  }
  disabled={atsLoadingJobId === job.id}
  className="rounded-lg border border-purple-500/40 px-5 py-3 font-semibold text-purple-300 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-60"
>
  {atsLoadingJobId === job.id
    ? "Running ATS..."
    : "Run Real ATS Match"}
</button>

                          </div>

{bestResumeResult && (
  <div className="mt-5 rounded-xl border border-cyan-500/30 bg-slate-950 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-400">
          AI Best Resume Selection
        </p>
        <h4 className="mt-1 text-lg font-semibold">
          {bestResumeResult.best_resume.resume_name}
        </h4>
        <p className="mt-1 text-sm text-slate-400">
          {bestResumeResult.best_resume.resume_category}
        </p>
      </div>

      <span
        className={`rounded-full px-4 py-2 text-lg font-bold ${
          bestResumeResult.best_resume.score >= 75
            ? "bg-emerald-500/15 text-emerald-400"
            : bestResumeResult.best_resume.score >= 50
            ? "bg-amber-500/15 text-amber-300"
            : "bg-red-500/15 text-red-300"
        }`}
      >
        {bestResumeResult.best_resume.score}% Best Match
      </span>
    </div>

    {bestResumeResult.selection_reason && (
      <p className="mt-4 text-sm leading-6 text-slate-300">
        {bestResumeResult.selection_reason}
      </p>
    )}

    <div className="mt-5 space-y-3">
      <p className="font-semibold">Resume Ranking</p>

      {bestResumeResult.rankings.map((ranking, index) => (
        <div
          key={ranking.resume_id}
          className="rounded-lg border border-slate-800 bg-slate-900 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                #{index + 1} {ranking.resume_name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {ranking.resume_category}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                ranking.score >= 75
                  ? "bg-emerald-500/15 text-emerald-400"
                  : ranking.score >= 50
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {ranking.score}% · {ranking.level}
            </span>
          </div>

          {ranking.reason && (
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {ranking.reason}
            </p>
          )}

          {ranking.strongest_matches?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-emerald-300">
                Strongest matches
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ranking.strongest_matches.slice(0, 6).map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
                  >
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ranking.important_gaps?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-amber-300">
                Important gaps
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ranking.important_gaps.slice(0, 5).map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>

    <div className="mt-4 rounded-lg bg-cyan-500/5 p-3 text-sm text-cyan-200">
      Run Real ATS Match will now use this AI-selected resume for this job.
    </div>
  </div>
)}

{realAtsResult && (
  <div className="mt-5 rounded-xl border border-purple-500/30 bg-slate-950 p-5">
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`rounded-full px-4 py-2 text-lg font-bold ${
          realAtsResult.overall_score >= 75
            ? "bg-emerald-500/15 text-emerald-400"
            : realAtsResult.overall_score >= 50
            ? "bg-amber-500/15 text-amber-300"
            : "bg-red-500/15 text-red-300"
        }`}
      >
        {realAtsResult.overall_score}% Real ATS Match
      </span>

      <span className="text-sm text-slate-300">
        {realAtsResult.level}
      </span>
    </div>

    <div className="mt-4 rounded-lg bg-purple-500/5 p-3">
      <p className="text-xs text-slate-500">
        Resume analyzed
      </p>

      <p className="mt-1 font-semibold text-purple-300">
        {realAtsResult.resume_name}
      </p>
    </div>

    {realAtsResult.matched_certifications?.length > 0 && (
      <div className="mt-5">
        <p className="font-semibold">
          Certifications Found
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {realAtsResult.matched_certifications.map((item) => (
            <span
              key={item}
              className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
            >
              ✓ {item}
            </span>
          ))}
        </div>
      </div>
    )}

    {realAtsResult.matched_skills?.length > 0 && (
      <div className="mt-5">
        <p className="font-semibold">
          Matched Skills
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {realAtsResult.matched_skills
            .slice(0, 15)
            .map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
              >
                ✓ {skill}
              </span>
            ))}
        </div>
      </div>
    )}

    {realAtsResult.missing_skills?.length > 0 && (
      <div className="mt-5">
        <p className="font-semibold">
          Missing / Weak Skills
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {realAtsResult.missing_skills
            .slice(0, 15)
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

    {realAtsResult.strengths?.length > 0 && (
      <div className="mt-5">
        <p className="font-semibold">
          Strengths
        </p>

        {realAtsResult.strengths.map((strength) => (
          <p
            key={strength}
            className="mt-2 text-sm text-emerald-300"
          >
            ✓ {strength}
          </p>
        ))}
      </div>
    )}

    {realAtsResult.gaps?.length > 0 && (
      <div className="mt-5">
        <p className="font-semibold">
          Gaps
        </p>

        {realAtsResult.gaps.map((gap) => (
          <p
            key={gap}
            className="mt-2 text-sm text-amber-300"
          >
            • {gap}
          </p>
        ))}
      </div>
    )}

    {realAtsResult.experience_alignment && (
      <div className="mt-5">
        <p className="font-semibold">
          Experience Alignment
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          {realAtsResult.experience_alignment}
        </p>
      </div>
    )}

    {realAtsResult.role_alignment && (
      <div className="mt-5">
        <p className="font-semibold">
          Role Alignment
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          {realAtsResult.role_alignment}
        </p>
      </div>
    )}

    {realAtsResult.tailoring_recommendations?.length > 0 && (
      <div className="mt-5 rounded-lg bg-cyan-500/5 p-4">
        <p className="font-semibold text-cyan-300">
          Resume Tailoring Recommendations
        </p>

        {realAtsResult.tailoring_recommendations.map(
          (recommendation) => (
            <p
              key={recommendation}
              className="mt-2 text-sm leading-6 text-slate-300"
            >
              • {recommendation}
            </p>
          )
        )}
      </div>
    )}

    {realAtsResult.summary && (
      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="font-semibold">
          AI Summary
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          {realAtsResult.summary}
        </p>
      </div>
    )}
  </div>
)}
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
