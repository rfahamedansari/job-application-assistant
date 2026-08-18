export type CollectedJob = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  country: "United Arab Emirates" | "Saudi Arabia" | "Qatar";
  source: string;
  job_url: string;
  job_description: string;
  employment_type: string | null;
  salary_text: string | null;
  posted_at: string | null;
  source_type: "formal_job" | "recruiter_post";
  application_method: "website" | "email" | "manual";
  contact_email: string | null;
  recruiter_name: string | null;
};

type SourceResult = {
  jobs: CollectedJob[];
  warning?: string;
};

const TARGET_TERMS = [
  "project manager",
  "technical project manager",
  "pmo",
  "service delivery manager",
  "service manager",
  "delivery manager",
  "operations manager",
  "telecom manager",
  "ict manager",
  "cloud service manager",
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractContactEmail(...values: string[]) {
  const combined = values.join(" ");
  const matches = combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const ignoredPrefixes = [
    "noreply@",
    "no-reply@",
    "privacy@",
    "support@",
  ];
  return matches.find((email) =>
    !ignoredPrefixes.some((prefix) => email.toLowerCase().startsWith(prefix))
  )?.toLowerCase() ?? null;
}

function applicationDetails(description: string, applyUrl = "") {
  const contactEmail = extractContactEmail(description, applyUrl);
  const asksForEmail = /(?:send|email|share|forward|submit)\s+(?:your\s+)?(?:cv|resume|profile|application)/i.test(description)
    || /(?:cv|resume|application).{0,40}(?:to|at)\s+[A-Z0-9._%+-]+@/i.test(description);
  return {
    source_type: contactEmail && asksForEmail ? "recruiter_post" as const : "formal_job" as const,
    application_method: contactEmail ? "email" as const : applyUrl ? "website" as const : "manual" as const,
    contact_email: contactEmail,
    recruiter_name: null,
  };
}

function inferCountry(value: string): CollectedJob["country"] | null {
  const normalized = value.toLowerCase();
  if (/saudi|riyadh|jeddah|dammam|khobar|ksa/.test(normalized)) {
    return "Saudi Arabia";
  }
  if (/united arab emirates|uae|dubai|abu dhabi|sharjah|ajman/.test(normalized)) {
    return "United Arab Emirates";
  }
  if (/qatar|doha/.test(normalized)) {
    return "Qatar";
  }
  return null;
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Project Manager";
}

function isRelevant(job: CollectedJob, roleQuery = "Project Manager") {
  const haystack = `${job.title} ${job.job_description}`.toLowerCase();
  const normalizedQuery = normalizeQuery(roleQuery).toLowerCase();
  const queryWords = normalizedQuery.split(" ").filter((word) => word.length > 2);
  return haystack.includes(normalizedQuery)
    || (queryWords.length > 0 && queryWords.every((word) => haystack.includes(word)))
    || TARGET_TERMS.some((term) => haystack.includes(term));
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function collectRemotive(): Promise<SourceResult> {
  try {
    const payload = await fetchJson("https://remotive.com/api/remote-jobs?category=project-management&limit=100");
    const rows = Array.isArray(payload.jobs) ? payload.jobs : [];
    const jobs = rows.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const location = text(item.candidate_required_location);
      const country = inferCountry(location);
      if (!country) return [];
      const description = stripHtml(text(item.description));
      const applyUrl = text(item.url);
      return [{
        external_id: `remotive-${String(item.id ?? text(item.url))}`,
        title: text(item.title),
        company: text(item.company_name) || "Company not specified",
        location,
        country,
        source: "Remotive",
        job_url: applyUrl,
        job_description: description,
        employment_type: text(item.job_type) || null,
        salary_text: text(item.salary) || null,
        posted_at: text(item.publication_date) || null,
        ...applicationDetails(description, applyUrl),
      }];
    });
    return { jobs: jobs.filter((job) => isRelevant(job)) };
  } catch (error) {
    return { jobs: [], warning: `Remotive: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectArbeitnow(): Promise<SourceResult> {
  try {
    const payload = await fetchJson("https://www.arbeitnow.com/api/job-board-api");
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const jobs = rows.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const location = text(item.location);
      const country = inferCountry(location);
      if (!country) return [];
      const created = Number(item.created_at);
      const description = stripHtml(text(item.description));
      const applyUrl = text(item.url);
      return [{
        external_id: `arbeitnow-${text(item.slug) || text(item.url)}`,
        title: text(item.title),
        company: text(item.company_name) || "Company not specified",
        location,
        country,
        source: "Arbeitnow",
        job_url: applyUrl,
        job_description: description,
        employment_type: Array.isArray(item.job_types) ? item.job_types.map(String).join(", ") : null,
        salary_text: null,
        posted_at: Number.isFinite(created) ? new Date(created * 1000).toISOString() : null,
        ...applicationDetails(description, applyUrl),
      }];
    });
    return { jobs: jobs.filter((job) => isRelevant(job)) };
  } catch (error) {
    return { jobs: [], warning: `Arbeitnow: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectAdzuna(countryCode: "ae" | "sa", roleQuery: string): Promise<SourceResult> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return { jobs: [], warning: "Adzuna: API keys not configured" };
  try {
    const query = encodeURIComponent(normalizeQuery(roleQuery));
    const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&results_per_page=50&what=${query}&sort_by=date`;
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload.results) ? payload.results : [];
    const jobs = rows.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const company = item.company && typeof item.company === "object" ? text((item.company as Record<string, unknown>).display_name) : "";
      const locationObject = item.location && typeof item.location === "object" ? item.location as Record<string, unknown> : {};
      const location = text(locationObject.display_name);
      const description = stripHtml(text(item.description));
      const applyUrl = text(item.redirect_url);
      return [{
        external_id: `adzuna-${String(item.id ?? text(item.redirect_url))}`,
        title: text(item.title),
        company: company || "Company not specified",
        location,
        country: countryCode === "ae" ? "United Arab Emirates" : "Saudi Arabia",
        source: "Adzuna",
        job_url: applyUrl,
        job_description: description,
        employment_type: text(item.contract_time) || null,
        salary_text: item.salary_min ? `${String(item.salary_min)}${item.salary_max ? `–${String(item.salary_max)}` : ""}` : null,
        posted_at: text(item.created) || null,
        ...applicationDetails(description, applyUrl),
      }];
    });
    return { jobs: jobs.filter((job) => isRelevant(job, roleQuery)) };
  } catch (error) {
    return { jobs: [], warning: `Adzuna ${countryCode.toUpperCase()}: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectJSearch(
  country: "United Arab Emirates" | "Saudi Arabia" | "Qatar",
  roleQuery: string,
  pageCount: number,
): Promise<SourceResult> {
  const apiKey = process.env.JSEARCH_RAPIDAPI_KEY;
  if (!apiKey) return { jobs: [], warning: "JSearch: API key not configured" };
  try {
    const searchText = country === "United Arab Emirates"
      ? `${normalizeQuery(roleQuery)} in Dubai, UAE`
      : country === "Saudi Arabia"
        ? `${normalizeQuery(roleQuery)} in Riyadh, Saudi Arabia`
        : `${normalizeQuery(roleQuery)} in Doha, Qatar`;
    const countryCode = country === "United Arab Emirates" ? "ae" : country === "Saudi Arabia" ? "sa" : "qa";
    const query = encodeURIComponent(searchText);
    const payload = await fetchJson(`https://jsearch.p.rapidapi.com/search-v2?query=${query}&num_pages=${pageCount}&date_posted=all&country=${countryCode}&language=en`, {
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
    });
    const responseData = payload.data;
    const rows = Array.isArray(responseData)
      ? responseData
      : responseData && typeof responseData === "object" && Array.isArray((responseData as Record<string, unknown>).jobs)
        ? (responseData as Record<string, unknown>).jobs as unknown[]
        : [];
    const jobs = rows.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const publisher = text(item.job_publisher);
      const description = text(item.job_description);
      const applyUrl = text(item.job_apply_link) || text(item.job_google_link);
      return [{
        external_id: `jsearch-${text(item.job_id) || text(item.job_apply_link)}`,
        title: text(item.job_title),
        company: text(item.employer_name) || "Company not specified",
        location: [text(item.job_city), text(item.job_state)].filter(Boolean).join(", "),
        country,
        source: publisher ? `JSearch · ${publisher}` : "JSearch",
        job_url: applyUrl,
        job_description: description,
        employment_type: text(item.job_employment_type) || null,
        salary_text: item.job_min_salary ? `${String(item.job_min_salary)}${item.job_max_salary ? `–${String(item.job_max_salary)}` : ""}` : null,
        posted_at: text(item.job_posted_at_datetime_utc) || null,
        ...applicationDetails(description, applyUrl),
      }];
    });
    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `JSearch ${country}: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

export async function collectJobs(
  roleQuery = "Project Manager",
  requestedUaePages = 6,
  secondaryCountries: Array<"Saudi Arabia" | "Qatar"> = [],
) {
  const normalizedQuery = normalizeQuery(roleQuery);
  const uaePageCount = Math.min(6, Math.max(1, Math.trunc(requestedUaePages) || 6));
  const results = await Promise.all([
    collectRemotive(),
    collectArbeitnow(),
    collectAdzuna("ae", normalizedQuery),
    ...(secondaryCountries.includes("Saudi Arabia") ? [collectAdzuna("sa", normalizedQuery)] : []),
  ]);
  const uaeJobs = await collectJSearch("United Arab Emirates", normalizedQuery, uaePageCount);
  results.push(uaeJobs);
  for (const country of secondaryCountries) {
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    results.push(await collectJSearch(country, normalizedQuery, 1));
  }
  const unique = new Map<string, CollectedJob>();
  const allowedCountries = new Set<CollectedJob["country"]>(["United Arab Emirates", ...secondaryCountries]);
  for (const job of results.flatMap((result) => result.jobs)) {
    if (!allowedCountries.has(job.country)) continue;
    const key = job.job_url || `${job.title}|${job.company}|${job.location}`.toLowerCase();
    if (job.title && job.job_url && !unique.has(key)) unique.set(key, job);
  }
  return {
    jobs: [...unique.values()],
    warnings: [...new Set(results.flatMap((result) => result.warning ? [result.warning] : []))],
  };
}
