# Vacancy Collector setup

The Top-10 collector supports UAE and Saudi Arabia.

## Sources

- Remotive and Arbeitnow: enabled without credentials.
- Adzuna: optional; configure `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in Vercel.
- JSearch: optional; configure `JSEARCH_RAPIDAPI_KEY` in Vercel. Results can include publisher labels such as Indeed, LinkedIn and other job boards when the provider returns them.

Direct scraping of LinkedIn, Indeed, NaukriGulf, Bayt or GulfTalent is intentionally not used. Those sources must be connected through an approved API/feed, imported recruiter email, or manually pasted post. This avoids unreliable scraping and account restrictions.

Automatic application remains disabled. Collection and ranking never submit an application or send a CV.
