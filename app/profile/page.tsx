"use client";

import { FormEvent, useEffect, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type ProfileForm = {
  full_name: string;
  target_categories: string;
  target_roles: string;
  preferred_countries: string;
  preferred_cities: string;
  skills: string;
  include_keywords: string;
  exclude_keywords: string;
  experience_years: string;
};

const emptyProfile: ProfileForm = {
  full_name: "",
  target_categories: "",
  target_roles: "",
  preferred_countries: "",
  preferred_cities: "",
  skills: "",
  include_keywords: "",
  exclude_keywords: "",
  experience_years: "",
};

function arrayToText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

function textToArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      setMessage("");

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

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          full_name,
          target_categories,
          target_roles,
          preferred_countries,
          preferred_cities,
          skills,
          include_keywords,
          exclude_keywords,
          experience_years
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Unable to load profile: ${error.message}`);
        setMessageType("error");
        setIsLoading(false);
        return;
      }

      setForm({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        target_categories: arrayToText(data?.target_categories),
        target_roles: arrayToText(data?.target_roles),
        preferred_countries: arrayToText(data?.preferred_countries),
        preferred_cities: arrayToText(data?.preferred_cities),
        skills: arrayToText(data?.skills),
        include_keywords: arrayToText(data?.include_keywords),
        exclude_keywords: arrayToText(data?.exclude_keywords),
        experience_years:
          data?.experience_years === null || data?.experience_years === undefined
            ? ""
            : String(data.experience_years),
      });

      setIsLoading(false);
    }

    loadProfile();
  }, []);

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Your session has expired. Please sign in again.");
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    const experienceYears = form.experience_years.trim()
      ? Number(form.experience_years)
      : null;

    if (
      experienceYears !== null &&
      (!Number.isFinite(experienceYears) || experienceYears < 0)
    ) {
      setMessage("Experience years must be a valid positive number.");
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    const payload = {
      id: user.id,
      full_name: form.full_name.trim() || null,
      target_categories: textToArray(form.target_categories),
      target_roles: textToArray(form.target_roles),
      preferred_countries: textToArray(form.preferred_countries),
      preferred_cities: textToArray(form.preferred_cities),
      skills: textToArray(form.skills),
      include_keywords: textToArray(form.include_keywords),
      exclude_keywords: textToArray(form.exclude_keywords),
      experience_years: experienceYears,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      setMessage(`Profile could not be saved: ${error.message}`);
      setMessageType("error");
      setIsSaving(false);
      return;
    }

    setMessage("Profile & Preferences saved successfully.");
    setMessageType("success");
    setIsSaving(false);
  }

  const messageStyles = {
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <section className="mx-auto max-w-6xl p-6 md:p-10">
          <header className="mb-8">
            <p className="text-sm font-medium text-cyan-400">
              Career Preferences
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Profile & Preferences
            </h1>

            <p className="mt-2 max-w-3xl text-slate-400">
              Keep your career targets, preferred locations, experience and
              skills updated. Career OS uses these details for job matching,
              resume recommendations and ATS analysis.
            </p>
          </header>

          {message && (
            <div
              className={`mb-6 rounded-xl border px-4 py-3 text-sm ${messageStyles[messageType]}`}
            >
              {message}
            </div>
          )}

          {isLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
              Loading your profile...
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 md:p-8"
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="full_name"
                    className="mb-2 block text-sm font-medium"
                  >
                    Full name
                  </label>

                  <input
                    id="full_name"
                    value={form.full_name}
                    onChange={(event) =>
                      updateField("full_name", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="Ahamed Ansari"
                  />
                </div>

                <div>
                  <label
                    htmlFor="experience_years"
                    className="mb-2 block text-sm font-medium"
                  >
                    Experience years
                  </label>

                  <input
                    id="experience_years"
                    type="number"
                    min="0"
                    step="1"
                    value={form.experience_years}
                    onChange={(event) =>
                      updateField("experience_years", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="15"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="target_categories"
                  className="mb-2 block text-sm font-medium"
                >
                  Target categories
                </label>

                <input
                  id="target_categories"
                  value={form.target_categories}
                  onChange={(event) =>
                    updateField("target_categories", event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                  placeholder="Project Management, PMO, Service Delivery, Cloud"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Separate multiple values with commas.
                </p>
              </div>

              <div>
                <label
                  htmlFor="target_roles"
                  className="mb-2 block text-sm font-medium"
                >
                  Target roles
                </label>

                <textarea
                  id="target_roles"
                  rows={3}
                  value={form.target_roles}
                  onChange={(event) =>
                    updateField("target_roles", event.target.value)
                  }
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                  placeholder="Technical Project Manager, PMO Manager, Service Delivery Manager"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="preferred_countries"
                    className="mb-2 block text-sm font-medium"
                  >
                    Preferred countries
                  </label>

                  <input
                    id="preferred_countries"
                    value={form.preferred_countries}
                    onChange={(event) =>
                      updateField("preferred_countries", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="UAE, Qatar, Saudi Arabia"
                  />
                </div>

                <div>
                  <label
                    htmlFor="preferred_cities"
                    className="mb-2 block text-sm font-medium"
                  >
                    Preferred cities
                  </label>

                  <input
                    id="preferred_cities"
                    value={form.preferred_cities}
                    onChange={(event) =>
                      updateField("preferred_cities", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="Sharjah, Dubai, Abu Dhabi"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="skills"
                  className="mb-2 block text-sm font-medium"
                >
                  Skills
                </label>

                <textarea
                  id="skills"
                  rows={4}
                  value={form.skills}
                  onChange={(event) =>
                    updateField("skills", event.target.value)
                  }
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                  placeholder="Project Management, ITIL, Service Delivery, Telecom, Azure, Power BI"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="include_keywords"
                    className="mb-2 block text-sm font-medium"
                  >
                    Include keywords
                  </label>

                  <textarea
                    id="include_keywords"
                    rows={4}
                    value={form.include_keywords}
                    onChange={(event) =>
                      updateField("include_keywords", event.target.value)
                    }
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="PMP, ITIL, PMO, Service Delivery, Cloud"
                  />
                </div>

                <div>
                  <label
                    htmlFor="exclude_keywords"
                    className="mb-2 block text-sm font-medium"
                  >
                    Exclude keywords
                  </label>

                  <textarea
                    id="exclude_keywords"
                    rows={4}
                    value={form.exclude_keywords}
                    onChange={(event) =>
                      updateField("exclude_keywords", event.target.value)
                    }
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-500"
                    placeholder="Intern, Junior, Commission only"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save Profile & Preferences"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}