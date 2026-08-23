export type CollectedJob = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  country: "United Arab Emirates" | "Saudi Arabia" | "Qatar" | "Oman";
  source: string;
  job_url: string;
  job_description: string;
  employment_type: string | null;
  salary_text: string | null;
  posted_at: string | null;
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
  if (/\boman\b|muscat|salalah|sohar/.test(normalized)) {
    return "Oman";
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
      return [{
        external_id: `remotive-${String(item.id ?? text(item.url))}`,
        title: text(item.title),
        company: text(item.company_name) || "Company not specified",
        location,
        country,
        source: "Remotive",
        job_url: text(item.url),
        job_description: stripHtml(text(item.description)),
        employment_type: text(item.job_type) || null,
        salary_text: text(item.salary) || null,
        posted_at: text(item.publication_date) || null,
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
      return [{
        external_id: `arbeitnow-${text(item.slug) || text(item.url)}`,
        title: text(item.title),
        company: text(item.company_name) || "Company not specified",
        location,
        country,
        source: "Arbeitnow",
        job_url: text(item.url),
        job_description: stripHtml(text(item.description)),
        employment_type: Array.isArray(item.job_types) ? item.job_types.map(String).join(", ") : null,
        salary_text: null,
        posted_at: Number.isFinite(created) ? new Date(created * 1000).toISOString() : null,
      }];
    });
    return { jobs: jobs.filter((job) => isRelevant(job)) };
  } catch (error) {
    return { jobs: [], warning: `Arbeitnow: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectJSearch(
  country: "United Arab Emirates" | "Saudi Arabia" | "Qatar" | "Oman",
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
        : country === "Qatar"
          ? `${normalizeQuery(roleQuery)} in Doha, Qatar`
          : `${normalizeQuery(roleQuery)} in Muscat, Oman`;
    const countryCode = country === "United Arab Emirates"
      ? "ae"
      : country === "Saudi Arabia"
        ? "sa"
        : country === "Qatar"
          ? "qa"
          : "om";
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
      return [{
        external_id: `jsearch-${text(item.job_id) || text(item.job_apply_link)}`,
        title: text(item.job_title),
        company: text(item.employer_name) || "Company not specified",
        location: [text(item.job_city), text(item.job_state)].filter(Boolean).join(", "),
        country,
        source: publisher ? `JSearch · ${publisher}` : "JSearch",
        job_url: text(item.job_apply_link) || text(item.job_google_link),
        job_description: text(item.job_description),
        employment_type: text(item.job_employment_type) || null,
        salary_text: item.job_min_salary ? `${String(item.job_min_salary)}${item.job_max_salary ? `–${String(item.job_max_salary)}` : ""}` : null,
        posted_at: text(item.job_posted_at_datetime_utc) || null,
      }];
    });
    const unlabeledCount = jobs.filter((job) => job.source === "JSearch").length;
    const warning = unlabeledCount > 0 && unlabeledCount === jobs.length
      ? `JSearch ${country}: none of the ${jobs.length} results reported a source site (likely direct employer/company-site postings for this search — this is real JSearch data, not a bug)`
      : undefined;
    return { jobs, warning };
  } catch (error) {
    return { jobs: [], warning: `JSearch ${country}: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

export async function collectJobs(
  roleQueries: string[] = ["Project Manager"],
  requestedUaePages = 6,
  secondaryCountries: Array<"Saudi Arabia" | "Qatar" | "Oman"> = [],
) {
  const normalizedQueries = [
    ...new Set(
      roleQueries
        .map((query) => normalizeQuery(query))
        .filter(Boolean)
    ),
  ].slice(0, 3); // cap at 3 distinct phrases to keep API usage bounded

  if (normalizedQueries.length === 0) normalizedQueries.push("Project Manager");

  const results = await Promise.all([
    collectRemotive(),
    collectArbeitnow(),
  ]);

  // Split the requested UAE page budget across the query phrases so total
  // API usage stays roughly the same as a single-phrase search, while
  // covering more of the ways this role actually gets titled.
  const uaePageCount = Math.min(6, Math.max(1, Math.trunc(requestedUaePages) || 6));
  const pagesPerQuery = Math.max(1, Math.ceil(uaePageCount / normalizedQueries.length));

  const uaeResults = await Promise.all(
    normalizedQueries.map((query) => collectJSearch("United Arab Emirates", query, pagesPerQuery))
  );
  results.push(...uaeResults);

  for (const country of secondaryCountries) {
    // Only the top 2 phrases for secondary countries, to control API cost —
    // these are already opt-in, lower-priority searches.
    for (const query of normalizedQueries.slice(0, 2)) {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      results.push(await collectJSearch(country, query, 1));
    }
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
