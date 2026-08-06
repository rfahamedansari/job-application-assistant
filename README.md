
# Job Application Automation Assistant

A local Streamlit app for:

- Uploading a DOCX, PDF, or TXT resume
- Comparing it against a pasted job description
- Estimating keyword match
- Identifying matched and missing keywords
- Drafting a tailored professional summary
- Drafting a cover letter
- Saving job opportunities in SQLite
- Tracking application status
- Exporting the tracker to CSV
- Creating recruiter follow-up messages

## Important

The app deliberately does **not** automatically log in or submit applications on LinkedIn, Indeed, NaukriGulf, or other portals. Automated submissions can violate portal terms, trigger spam controls, and produce low-quality applications. This assistant automates preparation and tracking while leaving the final review and submission to the candidate.

## Installation

1. Install Python 3.10 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
pip install -r requirements.txt
streamlit run app.py
```

The app opens in your browser.

## Data

Application records are stored locally in:

`job_applications.db`

Use the Export button inside the app to create a CSV backup.

## Suggested future upgrades

- Email reminders through Gmail
- Job alert import from email
- Multiple resume versions
- Interview question generator
- Dashboard charts
- Optional AI integration
- Browser extension for one-click job capture
