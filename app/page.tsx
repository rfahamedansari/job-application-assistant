"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import LogoutButton from "@/components/LogoutButton";
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
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  category: string | null;
  job_description: string | null;
  job_url: string;
};

type Application = {
  id: string;
  role: string;
  company: string;
  status: string;
  applied_at: string;
};

type MatchedJob = Job & {
  matchScore: number;
  matchLevel: string;
  recommendedResume: string | null;
};

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("User");
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("Please sign in again.");
      setIsLoading(false);
      return;
    }

    // USER PROFILE
    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select(`
          full_name,
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
      setErrorMessage(
        `Profile could not be loaded: ${profileError.message}`
      );
    }

    if (profileData?.full_name) {
      setUserName(profileData.full_name);
    } else if (user.user_metadata?.full_name) {
      setUserName(user.user_metadata.full_name);
    }

    // RESUMES
    const { data: resumeData, error: resumeError } =
      await supabase
        .from("resumes")
        .select("id, name, category")
        .eq("user_id", user.id);

    if (resumeError) {
      setErrorMessage(
        `Resumes could not be loaded: ${resumeError.message}`
      );
    }

    const resumes = (resumeData ?? []) as Resume[];

    // JOBS
    const { data: jobsData, error: jobsError } =
      await supabase
        .from("jobs")
        .select(`
          id,
          title,
          company,
          location,
          country,
          category,
          job_description,
          job_url
        `)
        .order("created_at", { ascending: false });

    if (jobsError) {
      setErrorMessage(
        `Jobs could not be loaded: ${jobsError.message}`
      );
      setIsLoading(false);
      return;
    }

    const loadedJobs = (jobsData ?? []) as Job[];

    setJobs(loadedJobs);

    // APPLICATIONS
    const { data: applicationData, error: applicationError } =
      await supabase
        .from("applications")
        .select(`
          id,
          role,
          company,
          status,
          applied_at
        `)
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false });

    if (applicationError) {
      setErrorMessage(
        `Applications could not be loaded: ${applicationError.message}`
      );
    }

    setApplications(
      (applicationData ?? []) as Application[]
    );

    // MATCH JOBS
    if (profileData) {
      const calculatedJobs = loadedJobs.map((job) => {
        const match = calculateJobMatch(
          profileData as Profile,
          job,
          resumes
        );

        return {
          ...job,
          matchScore: match.score,
          matchLevel: match.level,
          recommendedResume:
            match.recommendedResumeName,
        };
      });

      calculatedJobs.sort(
        (a, b) => b.matchScore - a.matchScore
      );

      setMatchedJobs(calculatedJobs.slice(0, 3));
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const interviewCount = applications.filter(
    (application) =>
      application.status === "Interview"
  ).length;

  const offerCount = applications.filter(
    (application) =>
      application.status === "Offer"
  ).length;

  const recruiterCount = applications.filter(
    (application) =>
      application.status === "Recruiter Contacted"
  ).length;

  const stats = [
    {
      label: "Jobs Found",
      value: jobs.length,
      note: "Available vacancies",
    },
    {
      label: "Applications",
      value: applications.length,
      note:
        applications.length === 1
          ? "1 application tracked"
          : `${applications.length} applications tracked`,
    },
    {
      label: "Interviews",
      value: interviewCount,
      note:
        interviewCount > 0
          ? "Interview opportunities"
          : "No interviews yet",
    },
    {
      label: "Offers",
      value: offerCount,
      note:
        offerCount > 0
          ? "Congratulations!"
          : "Keep progressing",
    },
  ];

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
                Career Dashboard
              </h1>
            </div>

            <nav className="space-y-2 text-sm">

              <Link
                href="/"
                className="block rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950"
              >
                Dashboard
              </Link>

              <Link
                href="/jobs"
                className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
              >
                Daily Jobs
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
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  Recruiters
</Link>

              <Link
  href="/interview-prep"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  Interview Prep
</Link>

             <Link
  href="/analytics"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  Analytics
</Link>

            </nav>
          </aside>

          {/* MAIN CONTENT */}
          <section className="flex-1 p-6 md:p-10">

            <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

              <div>
                <p className="text-sm font-medium text-cyan-400">
                  Welcome back, {userName}
                </p>

                <h2 className="mt-2 text-3xl font-bold">
                  Your Job Search Command Centre
                </h2>

                <p className="mt-2 text-slate-400">
                  Track jobs, applications, interviews,
                  offers and resume matches from one place.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">

                <Link
                  href="/jobs"
                  className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Add New Job
                </Link>

                <LogoutButton />

              </div>
            </header>

            {errorMessage && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                {errorMessage}
              </div>
            )}

            {isLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
                Loading your dashboard...
              </div>
            ) : (
              <>
                {/* REAL STATISTICS */}
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                  {stats.map((stat) => (
                    <article
                      key={stat.label}
                      className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                    >
                      <p className="text-sm text-slate-400">
                        {stat.label}
                      </p>

                      <p className="mt-3 text-3xl font-bold">
                        {stat.value}
                      </p>

                      <p className="mt-2 text-sm text-cyan-400">
                        {stat.note}
                      </p>
                    </article>
                  ))}

                </section>

                {/* HIGH MATCH JOBS + APPLICATIONS */}
                <section className="mt-8 grid gap-6 xl:grid-cols-2">

                  {/* HIGH MATCH */}
                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

                    <div className="mb-5 flex items-center justify-between">

                      <div>
                        <h3 className="text-xl font-semibold">
                          High Match Jobs
                        </h3>

                        <p className="text-sm text-slate-400">
                          Best opportunities based on your
                          profile
                        </p>
                      </div>

                      <Link
                        href="/jobs"
                        className="text-sm font-medium text-cyan-400"
                      >
                        View all
                      </Link>

                    </div>

                    {matchedJobs.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Add jobs and complete your profile to
                        see recommendations.
                      </p>
                    ) : (
                      <div className="space-y-4">

                        {matchedJobs.map((job) => (
                          <div
                            key={job.id}
                            className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                          >

                            <div className="flex items-start justify-between gap-4">

                              <div>
                                <h4 className="font-semibold">
                                  {job.title}
                                </h4>

                                <p className="mt-1 text-sm text-slate-400">
                                  {job.company}
                                </p>

                                <p className="mt-1 text-sm text-slate-500">
                                  {[job.location, job.country]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>

                                {job.recommendedResume && (
                                  <p className="mt-2 text-xs text-cyan-400">
                                    Resume:{" "}
                                    {job.recommendedResume}
                                  </p>
                                )}
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                                  job.matchScore >= 75
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : job.matchScore >= 50
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-red-500/15 text-red-300"
                                }`}
                              >
                                {job.matchScore}%
                              </span>

                            </div>
                          </div>
                        ))}

                      </div>
                    )}

                  </article>

                  {/* RECENT APPLICATIONS */}
                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

                    <div className="mb-5 flex items-center justify-between">

                      <div>
                        <h3 className="text-xl font-semibold">
                          Recent Applications
                        </h3>

                        <p className="text-sm text-slate-400">
                          Your latest application activity
                        </p>
                      </div>

                      <Link
                        href="/applications"
                        className="text-sm font-medium text-cyan-400"
                      >
                        View all
                      </Link>

                    </div>

                    {applications.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No applications tracked yet.
                      </p>
                    ) : (
                      <div className="space-y-4">

                        {applications
                          .slice(0, 4)
                          .map((application) => (
                            <div
                              key={application.id}
                              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
                            >

                              <div>
                                <h4 className="font-semibold">
                                  {application.role}
                                </h4>

                                <p className="mt-1 text-sm text-slate-400">
                                  {application.company}
                                </p>
                              </div>

                              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                                {application.status}
                              </span>

                            </div>
                          ))}

                      </div>
                    )}

                  </article>

                </section>

                {/* PIPELINE SUMMARY */}
                <section className="mt-6 grid gap-6 md:grid-cols-2">

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

                    <h3 className="text-xl font-semibold">
                      Application Progress
                    </h3>

                    <p className="mt-2 text-slate-400">
                      {recruiterCount} recruiter contact
                      {recruiterCount === 1 ? "" : "s"},{" "}
                      {interviewCount} interview
                      {interviewCount === 1 ? "" : "s"} and{" "}
                      {offerCount} offer
                      {offerCount === 1 ? "" : "s"}.
                    </p>

                    <Link
                      href="/applications"
                      className="mt-5 inline-block rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-800"
                    >
                      Open Applications
                    </Link>

                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

                    <h3 className="text-xl font-semibold">
                      Resume Library
                    </h3>

                    <p className="mt-2 text-slate-400">
                      Your uploaded resumes are now used by
                      the matching engine to recommend the
                      best CV for each vacancy.
                    </p>

                    <Link
                      href="/resumes"
                      className="mt-5 inline-block rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-800"
                    >
                      Open Resume Library
                    </Link>

                  </article>

                </section>
              </>
            )}

          </section>

        </div>
      </main>
    </AuthGuard>
  );
}