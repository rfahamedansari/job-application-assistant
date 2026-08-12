"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  title: string;
  company: string;
  created_at: string;
};

type Application = {
  id: string;
  status: string | null;
  applied_at: string | null;
  created_at: string;
};

type Recruiter = {
  id: string;
  status: string;
  follow_up_at: string | null;
};

type InterviewPrep = {
  id: string;
  status: string | null;
  interview_date: string | null;
};

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [interviews, setInterviews] = useState<InterviewPrep[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadAnalytics = useCallback(async () => {
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

    const [
      jobsResult,
      applicationsResult,
      recruitersResult,
      interviewsResult,
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, company, created_at")
        .eq("created_by", user.id),

      supabase
        .from("applications")
        .select("id, status, applied_at, created_at")
        .eq("user_id", user.id),

      supabase
        .from("recruiters")
        .select("id, status, follow_up_at")
        .eq("user_id", user.id),

      supabase
        .from("interview_prep")
        .select("id, status, interview_date")
        .eq("user_id", user.id),
    ]);

    if (jobsResult.error) {
      setMessage(`Jobs error: ${jobsResult.error.message}`);
      setIsLoading(false);
      return;
    }

    if (applicationsResult.error) {
      setMessage(
        `Applications error: ${applicationsResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (recruitersResult.error) {
      setMessage(
        `Recruiters error: ${recruitersResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    if (interviewsResult.error) {
      setMessage(
        `Interviews error: ${interviewsResult.error.message}`
      );
      setIsLoading(false);
      return;
    }

    setJobs((jobsResult.data ?? []) as Job[]);
    setApplications(
      (applicationsResult.data ?? []) as Application[]
    );
    setRecruiters(
      (recruitersResult.data ?? []) as Recruiter[]
    );
    setInterviews(
      (interviewsResult.data ?? []) as InterviewPrep[]
    );

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const appliedCount = applications.length;

  const interviewCount = interviews.length;

  const offerCount = applications.filter((application) =>
    ["offer", "offered", "Offer", "Offered"].includes(
      application.status ?? ""
    )
  ).length;

  const rejectedCount = applications.filter((application) =>
    ["rejected", "Rejected"].includes(
      application.status ?? ""
    )
  ).length;

  const activeRecruiters = recruiters.filter(
    (recruiter) => recruiter.status !== "Closed"
  ).length;

  const followUpsDue = recruiters.filter((recruiter) => {
    if (!recruiter.follow_up_at) return false;

    return (
      new Date(recruiter.follow_up_at).getTime() <=
      Date.now()
    );
  }).length;

  const scheduledInterviews = interviews.filter(
    (interview) => interview.status === "Scheduled"
  ).length;

  const completedInterviews = interviews.filter((interview) =>
    ["Completed", "Passed", "Rejected"].includes(
      interview.status ?? ""
    )
  ).length;

  const applicationRate = useMemo(() => {
    if (jobs.length === 0) return 0;

    return Math.round(
      (applications.length / jobs.length) * 100
    );
  }, [applications.length, jobs.length]);

  const interviewConversion = useMemo(() => {
    if (applications.length === 0) return 0;

    return Math.round(
      (interviews.length / applications.length) * 100
    );
  }, [applications.length, interviews.length]);

  const offerConversion = useMemo(() => {
    if (applications.length === 0) return 0;

    return Math.round(
      (offerCount / applications.length) * 100
    );
  }, [applications.length, offerCount]);

  const applicationStatuses = useMemo(() => {
    const counts: Record<string, number> = {};

    applications.forEach((application) => {
      const status =
        application.status?.trim() || "Unknown";

      counts[status] = (counts[status] || 0) + 1;
    });

    return Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    );
  }, [applications]);

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl">



          <section className="flex-1 p-6 md:p-10">

            <header className="mb-8">
              <p className="text-sm font-medium text-cyan-400">
                Career Performance Analytics
              </p>

              <h2 className="mt-2 text-3xl font-bold">
                Track your job search performance
              </h2>

              <p className="mt-2 max-w-3xl text-slate-400">
                Review your jobs, applications, interview
                activity, offers, recruiter engagement and
                conversion rates.
              </p>
            </header>

            {message && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {message}
              </div>
            )}

            {isLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                Loading analytics...
              </div>
            ) : (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <p className="text-sm text-slate-400">
                      Jobs Found
                    </p>

                    <p className="mt-3 text-3xl font-bold">
                      {jobs.length}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <p className="text-sm text-slate-400">
                      Applications
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

                <section className="mt-6 grid gap-4 md:grid-cols-3">

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <p className="text-sm text-slate-400">
                      Job → Application Rate
                    </p>

                    <p className="mt-3 text-3xl font-bold text-cyan-400">
                      {applicationRate}%
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Applications compared with jobs found.
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <p className="text-sm text-slate-400">
                      Application → Interview
                    </p>

                    <p className="mt-3 text-3xl font-bold text-cyan-400">
                      {interviewConversion}%
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Interviews compared with applications.
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <p className="text-sm text-slate-400">
                      Application → Offer
                    </p>

                    <p className="mt-3 text-3xl font-bold text-cyan-400">
                      {offerConversion}%
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Offers compared with applications.
                    </p>
                  </article>

                </section>

                <section className="mt-6 grid gap-6 xl:grid-cols-2">

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <h3 className="text-xl font-semibold">
                      Application Pipeline
                    </h3>

                    <div className="mt-5 space-y-3">
                      {applicationStatuses.length === 0 ? (
                        <p className="text-slate-400">
                          No application data yet.
                        </p>
                      ) : (
                        applicationStatuses.map(
                          ([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3"
                            >
                              <span className="text-slate-300">
                                {status}
                              </span>

                              <span className="font-semibold text-cyan-400">
                                {count}
                              </span>
                            </div>
                          )
                        )
                      )}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <h3 className="text-xl font-semibold">
                      Interview Activity
                    </h3>

                    <div className="mt-5 space-y-3">

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Scheduled
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {scheduledInterviews}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Completed
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {completedInterviews}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Rejected Applications
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {rejectedCount}
                        </span>
                      </div>

                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <h3 className="text-xl font-semibold">
                      Recruiter Activity
                    </h3>

                    <div className="mt-5 space-y-3">

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Total Recruiters
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {recruiters.length}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Active Contacts
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {activeRecruiters}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <span className="text-slate-300">
                          Follow-ups Due
                        </span>

                        <span className="font-semibold text-cyan-400">
                          {followUpsDue}
                        </span>
                      </div>

                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                    <h3 className="text-xl font-semibold">
                      Current Summary
                    </h3>

                    <p className="mt-5 text-sm leading-6 text-slate-300">
                      You have found{" "}
                      <span className="font-semibold text-cyan-400">
                        {jobs.length}
                      </span>{" "}
                      jobs, submitted{" "}
                      <span className="font-semibold text-cyan-400">
                        {applications.length}
                      </span>{" "}
                      applications and created preparation for{" "}
                      <span className="font-semibold text-cyan-400">
                        {interviews.length}
                      </span>{" "}
                      interviews.
                    </p>

                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      You currently have{" "}
                      <span className="font-semibold text-cyan-400">
                        {followUpsDue}
                      </span>{" "}
                      recruiter follow-up
                      {followUpsDue === 1 ? "" : "s"} due.
                    </p>
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