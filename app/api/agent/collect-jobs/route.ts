import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { calculateJobMatch } from "@/lib/jobMatch";
import { collectJobs } from "@/lib/jobSources";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authHeader = request.headers.get("authorization");

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500 });
    }
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      query?: unknown;
      uae_pages?: unknown;
      include_saudi?: unknown;
      include_qatar?: unknown;
    };
    const query = typeof body.query === "string"
      ? body.query.trim().replace(/\s+/g, " ").slice(0, 80) || "Project Manager"
      : "Project Manager";
    const requestedUaePages = typeof body.uae_pages === "number" ? body.uae_pages : 6;
    const uaePages = Math.min(6, Math.max(1, Math.trunc(requestedUaePages) || 6));
    const secondaryCountries: Array<"Saudi Arabia" | "Qatar"> = [];
    if (body.include_saudi === true) secondaryCountries.push("Saudi Arabia");
    if (body.include_qatar === true) secondaryCountries.push("Qatar");

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const [{ data: profile }, { data: resumes }, collected] = await Promise.all([
      supabase.from("profiles").select("target_categories,target_roles,preferred_countries,preferred_cities,skills,include_keywords,exclude_keywords,experience_years").eq("id", user.id).maybeSingle(),
      supabase.from("resumes").select("id,name,category").eq("user_id", user.id).order("is_primary", { ascending: false }),
      collectJobs(query, uaePages, secondaryCountries),
    ]);

    const fallbackProfile = {
      target_categories: ["Project Management", "PMO", "Service Delivery", "Telecom", "Operations", "Cloud"],
      target_roles: ["Project Manager", "Technical Project Manager", "PMO", "Service Delivery Manager", "Service Manager", "Operations Manager"],
      preferred_countries: ["United Arab Emirates", "Saudi Arabia", "Qatar"],
      preferred_cities: ["Dubai", "Abu Dhabi", "Sharjah", "Riyadh", "Jeddah", "Dammam", "Khobar", "Doha"],
      skills: ["PMP", "ITIL", "Project Management", "Service Delivery", "Telecom", "Vendor Management", "Stakeholder Management", "SLA", "KPI", "Risk Management"],
      include_keywords: ["ICT", "Telecom", "Managed Services", "PMO"],
      exclude_keywords: [],
      experience_years: 15,
    };

    const rankingProfile = profile ?? fallbackProfile;
    const profileWithSearchRole = {
      ...rankingProfile,
      target_roles: [
        query,
        ...(Array.isArray(rankingProfile.target_roles) ? rankingProfile.target_roles : []),
      ],
    };

    const allRanked = collected.jobs
      .map((job) => ({
        ...job,
        match: calculateJobMatch(profileWithSearchRole, { ...job, category: query }, resumes ?? []),
      }))
      .sort((a, b) => b.match.score - a.match.score || Date.parse(b.posted_at ?? "") - Date.parse(a.posted_at ?? ""));

    const ranked = allRanked.slice(0, 10);

    return NextResponse.json({
      success: true,
      jobs: ranked,
      all_jobs: allRanked,
      collected_count: allRanked.length,
      query,
      uae_pages: uaePages,
      requested_job_limit: (uaePages * 10) + (secondaryCountries.length * 10),
      countries: ["United Arab Emirates", ...secondaryCountries],
      warnings: collected.warnings,
      auto_apply_enabled: false,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected collection error." }, { status: 500 });
  }
}
