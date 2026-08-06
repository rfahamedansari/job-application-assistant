
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import List, Tuple

import pandas as pd
import streamlit as st
from docx import Document
from pypdf import PdfReader

DB_PATH = Path("job_applications.db")

STATUS_OPTIONS = [
    "Saved",
    "Resume Tailored",
    "Applied",
    "Recruiter Contacted",
    "Interview Scheduled",
    "Interview Completed",
    "Offer",
    "Rejected",
    "Withdrawn",
]

COMMON_SKILLS = [
    "project management", "service delivery", "pmo", "itil", "pmp",
    "stakeholder management", "vendor management", "risk management",
    "budget management", "cost control", "sla", "kpi", "incident management",
    "problem management", "change management", "major incident management",
    "telecom", "ict", "ftth", "gpon", "mpls", "ipvpn", "sd-wan", "cloud",
    "azure", "power bi", "jira", "microsoft project", "agile", "scrum",
    "waterfall", "managed services", "operations management", "service desk",
    "customer satisfaction", "resource planning", "governance", "reporting",
]

STOPWORDS = {
    "the","and","for","with","that","this","from","your","you","our","are","will",
    "have","has","job","role","work","team","into","within","using","years","year",
    "experience","skills","strong","ability","responsibilities","requirements",
    "preferred","required","including","ensure","manage","management","support",
    "across","through","their","they","who","all","any","but","not","can","day",
}


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            location TEXT,
            source TEXT,
            job_url TEXT,
            status TEXT,
            date_saved TEXT,
            date_applied TEXT,
            salary TEXT,
            contact_name TEXT,
            contact_email TEXT,
            match_score REAL,
            notes TEXT,
            job_description TEXT
        )
        """
    )
    conn.commit()
    return conn


def extract_text(uploaded_file) -> str:
    if uploaded_file is None:
        return ""
    suffix = Path(uploaded_file.name).suffix.lower()
    if suffix == ".docx":
        doc = Document(uploaded_file)
        return "\n".join(p.text for p in doc.paragraphs)
    if suffix == ".pdf":
        reader = PdfReader(uploaded_file)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if suffix == ".txt":
        return uploaded_file.getvalue().decode("utf-8", errors="ignore")
    return ""


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def extract_keywords(text: str, limit: int = 30) -> List[str]:
    text_n = normalize(text)
    found = []
    for skill in COMMON_SKILLS:
        if skill in text_n:
            found.append(skill)

    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", text_n)
    freq = {}
    for word in words:
        if word not in STOPWORDS and not word.isdigit():
            freq[word] = freq.get(word, 0) + 1

    ranked = sorted(freq, key=lambda w: (-freq[w], w))
    for word in ranked:
        if word not in found and len(found) < limit:
            found.append(word)
    return found[:limit]


def score_resume(resume_text: str, jd_text: str) -> Tuple[float, List[str], List[str]]:
    if not resume_text.strip() or not jd_text.strip():
        return 0.0, [], []
    resume_n = normalize(resume_text)
    keywords = extract_keywords(jd_text, 35)
    matched = [k for k in keywords if k in resume_n]
    missing = [k for k in keywords if k not in resume_n]
    score = round((len(matched) / max(len(keywords), 1)) * 100, 1)
    return score, matched, missing


def generate_summary(role: str, company: str, matched: List[str], missing: List[str]) -> str:
    strengths = ", ".join(matched[:8]) if matched else "relevant project and service-delivery experience"
    development = ", ".join(missing[:5]) if missing else "the role's core requirements"
    return (
        f"PMP- and ITIL-certified Telecom and ICT professional targeting the {role} role at "
        f"{company}. Brings extensive experience in {strengths}. Proven ability to coordinate "
        f"cross-functional teams, manage stakeholders, track delivery performance, and support "
        f"service and project governance. Resume should include truthful examples connected to "
        f"{development} where applicable."
    )


def generate_cover_letter(name: str, role: str, company: str, matched: List[str]) -> str:
    strengths = ", ".join(matched[:6]) if matched else "telecom, ICT delivery, and stakeholder coordination"
    return f"""Dear Hiring Manager,

I am applying for the {role} position at {company}. I bring more than 15 years of experience across telecom, ICT service delivery, project coordination, operations, and customer-facing support.

My background includes {strengths}. I have coordinated technical teams, vendors, field operations, and business stakeholders while supporting SLA performance, risk tracking, incident resolution, governance reporting, and timely delivery.

I hold PMP, ITIL 4 Foundation, Certified ScrumMaster, and Microsoft Azure certifications. I am particularly interested in this opportunity because it aligns with my goal of progressing into a broader project, PMO, or service-delivery leadership role.

I would welcome the opportunity to discuss how my experience can support {company}'s objectives.

Kind regards,
{name}"""


def add_application(data):
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO applications (
            company, role, location, source, job_url, status, date_saved,
            date_applied, salary, contact_name, contact_email, match_score,
            notes, job_description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        data,
    )
    conn.commit()
    conn.close()


def load_applications() -> pd.DataFrame:
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM applications ORDER BY id DESC", conn)
    conn.close()
    return df


def update_status(record_id: int, status: str, date_applied: str):
    conn = get_connection()
    conn.execute(
        "UPDATE applications SET status = ?, date_applied = ? WHERE id = ?",
        (status, date_applied, record_id),
    )
    conn.commit()
    conn.close()


st.set_page_config(page_title="Job Application Assistant", page_icon="💼", layout="wide")
st.title("💼 Job Application Automation Assistant")
st.caption("Track vacancies, compare your resume with job descriptions, create tailored drafts, and manage follow-ups.")

get_connection().close()

with st.sidebar:
    st.header("Candidate Profile")
    candidate_name = st.text_input("Name", "Ahamed Ansari")
    preferred_roles = st.text_area(
        "Target roles",
        "ICT Project Manager\nPMO Specialist\nService Delivery Manager\nTelecom Project Manager",
    )
    st.info(
        "This app does not automatically log in or submit forms on job portals. "
        "It prepares accurate application materials and keeps your pipeline organized."
    )

tab1, tab2, tab3, tab4 = st.tabs(
    ["Resume Match", "Save Application", "Application Tracker", "Follow-up Centre"]
)

with tab1:
    st.subheader("Resume-to-Job Match")
    left, right = st.columns(2)
    with left:
        resume_file = st.file_uploader("Upload resume", type=["docx", "pdf", "txt"])
        resume_text = extract_text(resume_file)
        if resume_text:
            st.success(f"Resume loaded: {len(resume_text.split())} words")
    with right:
        jd_text = st.text_area("Paste job description", height=280)

    company = st.text_input("Company", key="match_company")
    role = st.text_input("Role title", key="match_role")

    if st.button("Analyse Match", type="primary"):
        score, matched, missing = score_resume(resume_text, jd_text)
        st.session_state["analysis"] = {
            "score": score,
            "matched": matched,
            "missing": missing,
            "company": company,
            "role": role,
            "jd": jd_text,
        }

    analysis = st.session_state.get("analysis")
    if analysis:
        score = analysis["score"]
        st.metric("Estimated keyword match", f"{score}%")
        st.progress(min(int(score), 100) / 100)

        c1, c2 = st.columns(2)
        with c1:
            st.markdown("#### Matched keywords")
            st.write(", ".join(analysis["matched"]) or "No strong matches found.")
        with c2:
            st.markdown("#### Missing or weak keywords")
            st.write(", ".join(analysis["missing"]) or "No major keyword gaps found.")

        st.warning(
            "Use only keywords and claims that accurately reflect your real experience. "
            "This score is a resume comparison estimate, not a recruiter ATS score."
        )

        st.markdown("#### Tailored professional summary")
        summary = generate_summary(
            analysis["role"] or "target",
            analysis["company"] or "the employer",
            analysis["matched"],
            analysis["missing"],
        )
        st.text_area("Suggested summary", summary, height=160)

        st.markdown("#### Cover letter")
        cover = generate_cover_letter(
            candidate_name,
            analysis["role"] or "the advertised",
            analysis["company"] or "your organization",
            analysis["matched"],
        )
        st.text_area("Draft cover letter", cover, height=340)

with tab2:
    st.subheader("Save a Job Opportunity")
    with st.form("save_job_form", clear_on_submit=True):
        c1, c2 = st.columns(2)
        with c1:
            company_f = st.text_input("Company *")
            role_f = st.text_input("Role *")
            location_f = st.text_input("Location")
            source_f = st.selectbox(
                "Source", ["LinkedIn", "NaukriGulf", "Indeed", "Recruiter", "Company Website", "Other"]
            )
            job_url_f = st.text_input("Job URL")
            salary_f = st.text_input("Salary / range")
        with c2:
            status_f = st.selectbox("Status", STATUS_OPTIONS)
            contact_name_f = st.text_input("Recruiter / contact name")
            contact_email_f = st.text_input("Contact email")
            match_score_f = st.number_input("Match score", 0.0, 100.0, 0.0, 1.0)
            date_saved_f = st.date_input("Date saved", date.today())
            date_applied_f = st.date_input("Date applied", value=None)

        jd_f = st.text_area("Job description", height=180)
        notes_f = st.text_area("Notes")
        submitted = st.form_submit_button("Save Application", type="primary")

        if submitted:
            if not company_f.strip() or not role_f.strip():
                st.error("Company and role are required.")
            else:
                add_application(
                    (
                        company_f.strip(), role_f.strip(), location_f.strip(), source_f,
                        job_url_f.strip(), status_f, str(date_saved_f),
                        str(date_applied_f) if date_applied_f else "",
                        salary_f.strip(), contact_name_f.strip(), contact_email_f.strip(),
                        float(match_score_f), notes_f.strip(), jd_f.strip(),
                    )
                )
                st.success("Application saved.")

with tab3:
    st.subheader("Application Tracker")
    df = load_applications()
    if df.empty:
        st.info("No applications saved yet.")
    else:
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Total", len(df))
        m2.metric("Applied", int((df["status"] == "Applied").sum()))
        m3.metric("Interviews", int(df["status"].str.contains("Interview", na=False).sum()))
        m4.metric("Offers", int((df["status"] == "Offer").sum()))

        status_filter = st.multiselect("Filter status", STATUS_OPTIONS)
        view = df[df["status"].isin(status_filter)] if status_filter else df
        display_cols = [
            "id", "company", "role", "location", "source", "status",
            "date_saved", "date_applied", "match_score", "contact_name", "notes"
        ]
        st.dataframe(view[display_cols], use_container_width=True, hide_index=True)

        st.download_button(
            "Export tracker as CSV",
            view.to_csv(index=False).encode("utf-8"),
            "job_application_tracker.csv",
            "text/csv",
        )

        st.markdown("#### Update application status")
        c1, c2, c3 = st.columns(3)
        with c1:
            selected_id = st.selectbox("Application ID", view["id"].tolist())
        with c2:
            new_status = st.selectbox("New status", STATUS_OPTIONS, key="new_status")
        with c3:
            applied_date = st.date_input("Applied date", date.today(), key="update_date")
        if st.button("Update Status"):
            update_status(int(selected_id), new_status, str(applied_date))
            st.success("Status updated. Refresh the page to view the latest table.")

with tab4:
    st.subheader("Follow-up Centre")
    df = load_applications()
    candidates = df[df["status"].isin(["Applied", "Recruiter Contacted", "Interview Completed"])]
    if candidates.empty:
        st.info("No applications currently need follow-up.")
    else:
        selected = st.selectbox(
            "Select application",
            candidates["id"].tolist(),
            format_func=lambda x: (
                f"{x} — "
                f"{candidates.loc[candidates['id'] == x, 'company'].iloc[0]} — "
                f"{candidates.loc[candidates['id'] == x, 'role'].iloc[0]}"
            ),
        )
        row = candidates[candidates["id"] == selected].iloc[0]
        contact = row["contact_name"] or "Hiring Manager"
        followup = f"""Dear {contact},

I hope you are doing well.

I am following up regarding my application for the {row['role']} position at {row['company']}. I remain very interested in the opportunity and would appreciate any update you can share regarding the next stage of the recruitment process.

Please let me know if you require any additional information from my side.

Kind regards,
{candidate_name}"""
        st.text_area("Follow-up message", followup, height=260)
        st.caption("Recommended: send a polite follow-up about 5–7 business days after applying, unless the recruiter provided another timeline.")
