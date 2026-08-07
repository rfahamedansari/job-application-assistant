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

type Job = {
  title: string;
  company: string;
  location?: string | null;
  country?: string | null;
  category?: string | null;
  job_description?: string | null;
};

type Resume = {
  id: string;
  name: string;
  category: string;
};

export type JobMatchResult = {
  score: number;
  level: "High Match" | "Medium Match" | "Low Match";
  reasons: string[];
  missingSkills: string[];
  recommendedResumeId: string | null;
  recommendedResumeName: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function containsAny(text: string, values: string[]) {
  return values.some((value) =>
    text.includes(normalize(value))
  );
}

export function calculateJobMatch(
  profile: Profile,
  job: Job,
  resumes: Resume[]
): JobMatchResult {
  let score = 0;
  const reasons: string[] = [];
  const missingSkills: string[] = [];

  const jobText = normalize(
    [
      job.title,
      job.category,
      job.location,
      job.country,
      job.job_description,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const targetCategories =
    profile.target_categories ?? [];

  const targetRoles =
    profile.target_roles ?? [];

  const preferredCountries =
    profile.preferred_countries ?? [];

  const preferredCities =
    profile.preferred_cities ?? [];

  const skills =
    profile.skills ?? [];

  const includeKeywords =
    profile.include_keywords ?? [];

  const excludeKeywords =
    profile.exclude_keywords ?? [];

  // Category match - 20 points
  if (
    job.category &&
    targetCategories.some(
      (item) =>
        normalize(item) === normalize(job.category)
    )
  ) {
    score += 20;
    reasons.push(`Category match: ${job.category}`);
  }

  // Role/title match - 20 points
  if (
    targetRoles.length > 0 &&
    containsAny(normalize(job.title), targetRoles)
  ) {
    score += 20;
    reasons.push("Target job title matched");
  }

  // Country match - 15 points
  if (
    job.country &&
    preferredCountries.some(
      (item) =>
        normalize(item) === normalize(job.country)
    )
  ) {
    score += 15;
    reasons.push(`Preferred country: ${job.country}`);
  }

  // City/location match - 10 points
  if (
    job.location &&
    containsAny(normalize(job.location), preferredCities)
  ) {
    score += 10;
    reasons.push(`Preferred location: ${job.location}`);
  }

  // Skills - up to 25 points
  if (skills.length > 0) {
    const matchedSkills = skills.filter((skill) =>
      jobText.includes(normalize(skill))
    );

    const unmatchedSkills = skills.filter(
      (skill) => !jobText.includes(normalize(skill))
    );

    const skillScore = Math.round(
      (matchedSkills.length / skills.length) * 25
    );

    score += skillScore;

    if (matchedSkills.length > 0) {
      reasons.push(
        `Matched skills: ${matchedSkills
          .slice(0, 6)
          .join(", ")}`
      );
    }

    missingSkills.push(
      ...unmatchedSkills.slice(0, 6)
    );
  }

  // Include keywords - 10 points
  if (includeKeywords.length > 0) {
    const matchedKeywords =
      includeKeywords.filter((keyword) =>
        jobText.includes(normalize(keyword))
      );

    if (matchedKeywords.length > 0) {
      score += Math.round(
        (matchedKeywords.length /
          includeKeywords.length) *
          10
      );

      reasons.push(
        `Preferred keywords: ${matchedKeywords.join(", ")}`
      );
    }
  }

  // Excluded keywords penalty
  const blockedKeywords =
    excludeKeywords.filter((keyword) =>
      jobText.includes(normalize(keyword))
    );

  if (blockedKeywords.length > 0) {
    score -= 25;

    reasons.push(
      `Excluded keyword found: ${blockedKeywords.join(", ")}`
    );
  }

  score = Math.max(0, Math.min(100, score));

  let level: JobMatchResult["level"];

  if (score >= 75) {
    level = "High Match";
  } else if (score >= 50) {
    level = "Medium Match";
  } else {
    level = "Low Match";
  }

  // Resume recommendation
  let recommendedResume: Resume | undefined;

  if (job.category) {
    recommendedResume = resumes.find(
      (resume) =>
        normalize(resume.category) ===
        normalize(job.category)
    );
  }

  if (!recommendedResume && resumes.length > 0) {
    recommendedResume = resumes[0];
  }

  return {
    score,
    level,
    reasons,
    missingSkills,
    recommendedResumeId:
      recommendedResume?.id ?? null,
    recommendedResumeName:
      recommendedResume?.name ?? null,
  };
}