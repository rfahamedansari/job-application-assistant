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
  // Bayt and NaukriGulf's Apify actors extract a direct recruiter contact
  // straight from the listing — surfacing it here lets the app skip the
  // AI-parsing step for these jobs when deciding if it's an email
  // application, same as a manually pasted recruiter post would get.
  contact_email?: string | null;
  // Set to "email" whenever a source gives us a direct contact address
  // (currently Bayt and NaukriGulf), so these jobs correctly appear under
  // the Email Apply tab instead of only being reachable via a website link.
  application_method?: "email" | "website" | null;
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

const APIFY_COUNTRY_MAP: Record<CollectedJob["country"], string> = {
  "United Arab Emirates": "AE",
  "Saudi Arabia": "SA",
  Qatar: "QA",
  Oman: "OM",
};

// Module-level so both the LinkedIn description scan (inside collectJobs)
// and the LinkedIn hiring-post collector (below) can use the same pattern.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Runs an Apify Actor synchronously and returns its raw dataset items.
// Uses the REST API directly (not the Apify MCP tools, which only exist in
// this development chat) — the deployed app authenticates with its own
// APIFY_API_TOKEN. Actor IDs use "~" in REST URLs (e.g.
// "valig~linkedin-jobs-scraper"), not "/" as shown on the Apify Store site.
async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.apify.com/v2/actors/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(
      token
    )}&timeout=60`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    }
  );

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const items = (await response.json()) as unknown;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

async function collectApifyLinkedIn(
  country: CollectedJob["country"],
  roleQuery: string,
  city: string
): Promise<SourceResult> {
  try {
    const items = await runApifyActor("valig~linkedin-jobs-scraper", {
      keywords: normalizeQuery(roleQuery),
      location: `${city}, ${country}`,
      limit: 25,
    });

    const jobs: CollectedJob[] = items.flatMap((item) => {
      const url = text(item.url);
      if (!url) return [];
      return [{
        external_id: `apify-linkedin-${text(item.id) || url}`,
        title: text(item.title),
        company: text(item.companyName) || "Company not specified",
        location: text(item.location),
        country,
        source: "Apify · LinkedIn",
        job_url: url,
        job_description: text(item.description),
        employment_type: text(item.contractType) || null,
        salary_text: text(item.salary) || null,
        posted_at: text(item.postedDate) || null,
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Apify LinkedIn: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectApifyIndeed(
  country: CollectedJob["country"],
  roleQuery: string,
  city: string
): Promise<SourceResult> {
  try {
    const items = await runApifyActor("valig~indeed-jobs-scraper", {
      country: APIFY_COUNTRY_MAP[country].toLowerCase(),
      title: normalizeQuery(roleQuery),
      location: city,
      limit: 25,
    });

    const jobs: CollectedJob[] = items.flatMap((item) => {
      const url = text(item.jobUrl) || text(item.url);
      if (!url) return [];
      const location = item.location as Record<string, unknown> | undefined;
      const employer = item.employer as Record<string, unknown> | undefined;
      const description = item.description as Record<string, unknown> | undefined;
      const baseSalary = item.baseSalary as Record<string, unknown> | undefined;
      const salaryMin = baseSalary?.min;
      const salaryCurrency = text(baseSalary?.currencyCode);
      return [{
        external_id: `apify-indeed-${text(item.key) || url}`,
        title: text(item.title),
        company: text(employer?.name) || "Company not specified",
        location: text(location?.city) || city,
        country,
        source: "Apify · Indeed",
        job_url: url,
        job_description: text(description?.text),
        employment_type: null,
        salary_text: salaryMin ? `${salaryCurrency} ${String(salaryMin)}` : null,
        posted_at: text(item.datePublished) || null,
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Apify Indeed: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectApifyBayt(
  country: CollectedJob["country"],
  roleQuery: string,
  city: string
): Promise<SourceResult> {
  try {
    const items = await runApifyActor("blackfalcondata~bayt-scraper", {
      query: normalizeQuery(roleQuery),
      country: APIFY_COUNTRY_MAP[country],
      location: city,
      maxResults: 25,
    });

    const jobs: CollectedJob[] = items.flatMap((item) => {
      const url = text(item.url) || text(item.applyUrl);
      if (!url) return [];
      return [{
        external_id: `apify-bayt-${text(item.jobId) || url}`,
        title: text(item.title),
        company: text(item.company) || "Company not specified",
        location: text(item.location) || text(item.city),
        country,
        source: "Apify · Bayt",
        job_url: url,
        job_description: text(item.description),
        employment_type: text(item.employmentType) || null,
        salary_text: text(item.salaryText) || null,
        posted_at: text(item.postedDate) || text(item.postedAt) || null,
        contact_email: text(item.contactEmail) || null,
        application_method: text(item.contactEmail) ? "email" : "website",
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Apify Bayt: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectApifyGulfTalent(
  country: CollectedJob["country"],
  roleQuery: string,
  city: string
): Promise<SourceResult> {
  try {
    const items = await runApifyActor("blackfalcondata~gulftalent-scraper", {
      query: normalizeQuery(roleQuery),
      country: APIFY_COUNTRY_MAP[country],
      maxResults: 25,
    });

    const jobs: CollectedJob[] = items.flatMap((item) => {
      const url = text(item.canonicalUrl) || text(item.applyUrl) || text(item.sourceUrl);
      if (!url) return [];
      return [{
        external_id: `apify-gulftalent-${text(item.jobId) || url}`,
        title: text(item.title),
        company: text(item.company) || "Company not specified",
        location: text(item.locationLocality) || city,
        country,
        source: "Apify · GulfTalent",
        job_url: url,
        job_description: text(item.descriptionText) || text(item.description),
        employment_type: text(item.employmentType) || null,
        salary_text: text(item.salaryText) || null,
        posted_at: text(item.postedAt) || null,
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Apify GulfTalent: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectApifyNaukriGulf(
  country: CollectedJob["country"],
  roleQuery: string
): Promise<SourceResult> {
  try {
    const items = await runApifyActor("blackfalcondata~naukrigulf-scraper", {
      query: normalizeQuery(roleQuery),
      location: country,
      maxResults: 25,
    });

    const jobs: CollectedJob[] = items.flatMap((item) => {
      const url = text(item.url);
      if (!url) return [];
      return [{
        external_id: `apify-naukrigulf-${text(item.jobId) || url}`,
        title: text(item.title),
        company: text(item.company) || "Company not specified",
        location: text(item.location),
        country,
        source: "Apify · NaukriGulf",
        job_url: url,
        job_description: text(item.description),
        employment_type: text(item.employmentType) || null,
        salary_text: text(item.salaryMinText) || null,
        posted_at: text(item.postedAt) || null,
        contact_email: text(item.contactEmail) || null,
        application_method: text(item.contactEmail) ? "email" : "website",
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Apify NaukriGulf: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

async function collectCrustdata(
  country: CollectedJob["country"],
  roleQuery: string
): Promise<SourceResult> {
  const apiKey = process.env.CRUSTDATA_API_KEY;
  if (!apiKey) return { jobs: [], warning: "Crustdata: API key not configured" };
  try {
    const response = await fetch("https://api.crustdata.com/job/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-api-version": "2025-11-01",
      },
      body: JSON.stringify({
        filters: {
          op: "and",
          conditions: [
            { field: "job_details.title", type: "(.)", value: normalizeQuery(roleQuery) },
            { field: "location.country", type: "(.)", value: country },
          ],
        },
        limit: 25,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { job_listings?: unknown };
    const listings = Array.isArray(payload.job_listings) ? payload.job_listings : [];

    const jobs: CollectedJob[] = listings.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const url = text(item.url);
      if (!url) return [];
      return [{
        external_id: `crustdata-${text(item.crustdata_job_id) || url}`,
        title: text(item.title),
        company: text(item.company_name) || "Company not specified",
        location: text(item.city) || text(item.location),
        country,
        source: "Crustdata",
        job_url: url,
        job_description: text(item.description),
        employment_type: text(item.workplace_type) || null,
        salary_text: null,
        posted_at: text(item.date_added) || null,
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Crustdata: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

// Finds personal LinkedIn "hiring" posts — the informal recruiter-post
// pattern (e.g. "🚨 Hiring PMO, Dubai — email your CV to...") that never
// appears in LinkedIn's structured Jobs board and so can never be reached
// by a jobs-board scraper. Uses Crustdata's LinkedIn post keyword search,
// which indexes the actual social feed. Only posts where a genuine email
// address is found in the text are kept — a "DM me" post with no email
// isn't actionable through the app's email-application workflow.
async function collectCrustdataLinkedInPosts(
  country: CollectedJob["country"],
  roleQuery: string,
  city: string
): Promise<SourceResult> {
  const apiKey = process.env.CRUSTDATA_API_KEY;
  if (!apiKey) return { jobs: [] };

  try {
    const response = await fetch(
      "https://api.crustdata.com/screener/linkedin_posts/keyword_search/",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-api-version": "2025-11-01",
        },
        body: JSON.stringify({
          keyword: `hiring ${normalizeQuery(roleQuery)} ${city}`,
          date_posted: "past-week",
          limit: 20,
          format: "json",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { posts?: unknown };
    const posts = Array.isArray(payload.posts) ? payload.posts : [];

    const jobs: CollectedJob[] = posts.flatMap((row): CollectedJob[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const postText = text(item.text);
      const emailMatch = postText.match(EMAIL_PATTERN);

      // Skip posts with no extractable email — not actionable via the
      // email-application workflow, and we don't want to clutter results
      // with posts that just say "DM me" or link out elsewhere.
      if (!emailMatch) return [];

      const url = text(item.share_url);
      if (!url) return [];

      const authorName = text(item.actor_name);
      // Use the post's first line as a title — hiring posts are almost
      // always written as a short headline first line ("Hiring | PMO...").
      const firstLine = postText.split("\n")[0]?.replace(/^[^\p{L}\p{N}]+/u, "").trim();

      return [{
        external_id: `crustdata-linkedin-post-${text(item.uid) || url}`,
        title: firstLine || `${roleQuery} — LinkedIn hiring post`,
        company: authorName ? `Posted by ${authorName}` : "Recruiter post",
        location: city,
        country,
        source: "Crustdata · LinkedIn Post",
        job_url: url,
        job_description: postText,
        employment_type: null,
        salary_text: null,
        posted_at: text(item.date_posted) || null,
        contact_email: emailMatch[0],
        application_method: "email",
      }];
    });

    return { jobs };
  } catch (error) {
    return { jobs: [], warning: `Crustdata LinkedIn Posts: ${error instanceof Error ? error.message : "unavailable"}` };
  }
}

const COUNTRY_PRIMARY_CITY: Record<CollectedJob["country"], string> = {
  "United Arab Emirates": "Dubai",
  "Saudi Arabia": "Riyadh",
  Qatar: "Doha",
  Oman: "Muscat",
};

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

  // Crustdata only runs when CRUSTDATA_API_KEY is configured — same
  // opt-in safety pattern as the Apify sources above.
  if (process.env.CRUSTDATA_API_KEY) {
    const primaryQuery = normalizedQueries[0];
    results.push(await collectCrustdata("United Arab Emirates", primaryQuery));
    results.push(
      await collectCrustdataLinkedInPosts(
        "United Arab Emirates",
        primaryQuery,
        COUNTRY_PRIMARY_CITY["United Arab Emirates"]
      )
    );
    for (const country of secondaryCountries) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      results.push(await collectCrustdata(country, primaryQuery));
      await new Promise((resolve) => setTimeout(resolve, 500));
      results.push(
        await collectCrustdataLinkedInPosts(
          country,
          primaryQuery,
          COUNTRY_PRIMARY_CITY[country]
        )
      );
    }
  }

  // Apify sources only run when APIFY_API_TOKEN is configured — this keeps
  // the app working exactly as before for anyone who hasn't set it up, and
  // avoids charging your Apify account by accident.
  // TEMPORARY DIAGNOSTIC — remove once the env var issue is confirmed fixed.
  console.log(
    "[collect-jobs-debug] APIFY_API_TOKEN present:",
    Boolean(process.env.APIFY_API_TOKEN),
    "length:",
    process.env.APIFY_API_TOKEN?.length ?? 0
  );
  console.log(
    "[collect-jobs-debug] CRUSTDATA_API_KEY present:",
    Boolean(process.env.CRUSTDATA_API_KEY),
    "length:",
    process.env.CRUSTDATA_API_KEY?.length ?? 0
  );

  if (process.env.APIFY_API_TOKEN) {
    const primaryQuery = normalizedQueries[0];
    const uaeCity = COUNTRY_PRIMARY_CITY["United Arab Emirates"];
    const apifyResults = await Promise.all([
      collectApifyLinkedIn("United Arab Emirates", primaryQuery, uaeCity),
      collectApifyIndeed("United Arab Emirates", primaryQuery, uaeCity),
      collectApifyBayt("United Arab Emirates", primaryQuery, uaeCity),
      collectApifyGulfTalent("United Arab Emirates", primaryQuery, uaeCity),
      collectApifyNaukriGulf("United Arab Emirates", primaryQuery),
    ]);
    results.push(...apifyResults);

    for (const country of secondaryCountries) {
      const city = COUNTRY_PRIMARY_CITY[country];
      const secondaryApifyResults = await Promise.all([
        collectApifyLinkedIn(country, primaryQuery, city),
        collectApifyIndeed(country, primaryQuery, city),
        collectApifyBayt(country, primaryQuery, city),
        collectApifyGulfTalent(country, primaryQuery, city),
        collectApifyNaukriGulf(country, primaryQuery),
      ]);
      results.push(...secondaryApifyResults);
    }
  }

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

// Applies only to LinkedIn results, per your request — Indeed, GulfTalent,
// and JSearch descriptions are not scanned. Bayt and NaukriGulf already get
// a real, structured contact_email directly from their own Apify actors
// (see collectApifyBayt/collectApifyNaukriGulf above), so they don't need
// this fallback either.
function detectEmailInDescription(job: CollectedJob): CollectedJob {
  if (job.contact_email) return job;
  if (!job.source.includes("LinkedIn")) return job;

  const match = job.job_description.match(EMAIL_PATTERN);
  if (!match) return job;

  return {
    ...job,
    contact_email: match[0],
    application_method: "email",
  };
}

const unique = new Map<string, CollectedJob>();
  const allowedCountries = new Set<CollectedJob["country"]>(["United Arab Emirates", ...secondaryCountries]);
  for (const rawJob of results.flatMap((result) => result.jobs)) {
    if (!allowedCountries.has(rawJob.country)) continue;
    const job = detectEmailInDescription(rawJob);
    const key = job.job_url || `${job.title}|${job.company}|${job.location}`.toLowerCase();
    if (job.title && job.job_url && !unique.has(key)) unique.set(key, job);
  }
  return {
    jobs: [...unique.values()],
    warnings: [...new Set(results.flatMap((result) => result.warning ? [result.warning] : []))],
  };
}
