# Product Requirements Document
## MediNotes Pro — MVP Feature Expansion

**Version:** 1.0  
**Date:** April 2026  
**Status:** Draft  

---

## 1. Overview

### 1.1 Purpose
This document defines the product requirements for the MVP expansion of MediNotes Pro, an AI-powered healthcare consultation assistant. It covers the full feature roadmap across four sequential phases, from foundational infrastructure through to patient-facing capabilities.

### 1.2 Background
MediNotes Pro currently allows authenticated, subscribed doctors to enter patient consultation notes and receive an AI-generated summary, including a draft patient email, delivered via real-time streaming. The app has no persistence layer, no user roles, and no structured data model. This PRD defines the work required to evolve the app into a production-grade clinical tool.

### 1.3 Target Users
- **Doctors** — primary users who create patient records, enter consultation notes, review AI-generated summaries, and send communications to patients.
- **Patients** — secondary users who create their own accounts, receive consultation summaries by email, and interact with patient-facing features.

### 1.4 Scope
This PRD covers four phases of development:

| Phase | Theme |
|---|---|
| 1 | Foundations |
| 2 | Core Clinical Workflow |
| 3 | Enhanced Input & Patient Features |
| 4 | Quality & Compliance |

---

## 2. Assumptions & Constraints

1. Patients create their own accounts via the existing Clerk authentication flow.
2. The app will initially launch in an English-speaking market; multi-language support is deferred.
3. Lab PDF upload is deferred to a post-MVP release.
4. The feedback loop (summary ratings) is deferred to Phase 4.
5. The app uses `gpt-4o-mini` (or equivalent) for all AI features.
6. **Supabase (PostgreSQL)** is the chosen persistence layer.
7. The existing stack (Next.js Page Router, FastAPI, Clerk, Vercel) remains unchanged.
8. HIPAA compliance is a target; all design decisions should be made with this in mind.

---

## 3. Phase 1 — Foundations

> Nothing else in this roadmap is buildable without Phase 1. These are strict prerequisites.

### 3.1 Database Setup (Supabase)

**Goal:** Introduce a Supabase PostgreSQL database to persist all application data.

#### Schema

**`users`**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key; matches Clerk `user_id` |
| `email` | `text` | Unique |
| `role` | `enum('doctor', 'patient')` | Assigned on first sign-in |
| `full_name` | `text` | |
| `created_at` | `timestamptz` | |
| `consent_given_at` | `timestamptz` | Null until consent is recorded |

**`doctor_patient_links`**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `doctor_id` | `uuid` | FK → `users.id` |
| `patient_id` | `uuid` | FK → `users.id` |
| `created_at` | `timestamptz` | |

**`visits`**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `doctor_id` | `uuid` | FK → `users.id` |
| `patient_id` | `uuid` | FK → `users.id` |
| `date_of_visit` | `date` | |
| `notes` | `text` | Doctor's raw consultation notes |
| `created_at` | `timestamptz` | |

**`summaries`**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `visit_id` | `uuid` | FK → `visits.id` |
| `structured_output` | `jsonb` | Full structured JSON from LLM |
| `status` | `enum('pending_review', 'approved', 'sent')` | Workflow state |
| `approved_by` | `uuid` | FK → `users.id` (doctor) |
| `approved_at` | `timestamptz` | |
| `sent_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

#### Backend Requirements
- Supabase Python client (`supabase-py`) integrated into the FastAPI app.
- Database credentials stored as environment variables; never committed.
- All DB operations use parameterised queries; no raw string interpolation.
- Row-level security (RLS) enabled on all tables; doctors can only read/write their own patients' data.

---

### 3.2 Doctor & Patient User Profiles

**Goal:** Distinguish between doctor and patient accounts; associate patients with doctors.

#### User Stories

| ID | Role | Story |
|---|---|---|
| US-01 | Doctor | On first sign-in, I am prompted to identify myself as a doctor so the app presents the correct interface. |
| US-02 | Patient | On first sign-in, I am prompted to identify myself as a patient. |
| US-03 | Doctor | I can add a patient to my list by searching for their registered email address. |
| US-04 | Doctor | I can see a list of my patients from my dashboard. |
| US-05 | Patient | I can see my profile and the doctor(s) I am linked to. |

#### Functional Requirements
- On first sign-in (detected by absence of a `users` record for the Clerk `user_id`), the user is presented with a role selection screen.
- Role is written to the `users` table and cannot be changed without admin intervention.
- Doctors can search for patients by email; the search only returns users with `role = 'patient'`.
- A successful search result allows the doctor to "Add Patient", which creates a `doctor_patient_links` record.
- Route protection is enforced server-side: doctor routes return 403 for patient tokens, and vice versa.

#### Non-Functional Requirements
- Role selection UI must be clear and unambiguous; no risk of accidentally selecting the wrong role.
- Search must not expose patient PII beyond email; no full name returned until the link is established.

---

### 3.3 Structured JSON Output

**Goal:** Replace the current free-form markdown response with a validated JSON schema, enabling reliable downstream processing.

#### JSON Schema

```json
{
  "visit_summary": {
    "doctor_summary": "string — clinical summary for the doctor's records",
    "next_steps_for_doctor": ["string", "..."],
    "patient_email_draft": {
      "subject": "string",
      "body": "string — written in plain, patient-friendly language"
    },
    "safety_flags": {
      "has_flags": "boolean",
      "flags": [
        {
          "type": "enum: unclear_language | missing_follow_up | risky_interpretation",
          "description": "string — brief explanation of the flag"
        }
      ]
    }
  }
}
```

#### Functional Requirements
- The FastAPI endpoint must instruct the LLM to return **only** valid JSON matching this schema; no preamble, no markdown fences.
- The response must be validated against the schema before being stored; malformed responses must trigger a retry (up to 2 retries) before returning a 500 error.
- The structured output is stored in the `summaries.structured_output` (JSONB) column.
- The frontend must be updated to render each section of the JSON independently (no longer rendering raw markdown).

#### Streaming Consideration
Streaming a JSON response is complex to parse mid-flight. For Phase 1, switch to a **non-streaming** response for simplicity and reliability. Streaming can be reintroduced in a later phase once the structured output format is stable.

---

### 3.4 Patient Consent Management

**Goal:** Record documented patient consent before any personal health data is stored or shared.

#### Functional Requirements
- During patient account creation (first sign-in, after role selection), the patient must be presented with the app's Terms & Conditions and Privacy Policy.
- The patient must actively check a checkbox confirming acceptance; pre-checked boxes are not permitted.
- On acceptance, `users.consent_given_at` is set to the current UTC timestamp.
- No patient health data (visits, summaries) may be stored or sent unless `consent_given_at` is non-null.
- Patients may request account deletion via a support email; a data deletion process must be documented (even if manual at MVP).

---

## 4. Phase 2 — Core Clinical Workflow

### 4.1 Review & Approval Workflow

**Goal:** Implement a human-in-the-loop step where a doctor reviews, optionally edits, and explicitly approves a generated summary before it is sent to a patient.

#### User Stories

| ID | Role | Story |
|---|---|---|
| US-06 | Doctor | After generating a summary, I am presented with each section for review before I can send it to the patient. |
| US-07 | Doctor | I can edit the patient email draft inline before approving. |
| US-08 | Doctor | I must click an explicit "Approve & Send" button; there is no auto-send. |
| US-09 | Doctor | Once approved, I can see the status of the summary change to "Approved". |

#### Functional Requirements
- After generation, the summary status is set to `pending_review`.
- The product page renders a review panel showing all three sections (doctor summary, next steps, patient email draft) alongside the input form.
- The patient email draft section is rendered as an editable rich-text field.
- Edits made by the doctor are saved back to `summaries.structured_output` before approval.
- Clicking "Approve & Send" sets `status = 'approved'`, `approved_by`, and `approved_at`.
- No email is sent unless `status = 'approved'`.
- The "Approve & Send" button is disabled and visually distinct until the doctor has scrolled through / acknowledged all sections.

#### Non-Functional Requirements
- The review panel must clearly distinguish doctor-only content (clinical summary, next steps) from patient-facing content (email draft).
- Edit history is not required at MVP but the final approved state must be persisted.

---

### 4.2 Send Summary to Patient Email

**Goal:** Deliver the approved patient email draft to the patient's registered email address.

#### User Stories

| ID | Role | Story |
|---|---|---|
| US-10 | Doctor | After approving a summary, the patient email is automatically sent to their registered email address. |
| US-11 | Patient | I receive a clear, professional email summarising my consultation in plain language. |

#### Functional Requirements
- Email sending is triggered by the approval action (US-08 above).
- The patient's email address is fetched from `users.email`; it is never entered manually by the doctor.
- Email is sent via **Resend** (recommended) or SendGrid.
- The email template is branded (MediNotes Pro), includes the patient's name, visit date, and the approved body text.
- On successful delivery, `summaries.sent_at` is set to the current UTC timestamp and `status` is updated to `'sent'`.
- On delivery failure, the error is logged and the doctor is notified in-app; the status remains `'approved'` so a retry can be attempted.
- Email sending is a backend operation only; the email service API key is never exposed to the frontend.

#### Email Template Requirements
- Subject: as generated by the LLM (from `patient_email_draft.subject`), reviewable and editable by the doctor before approval.
- Salutation uses the patient's `full_name`.
- Footer includes a disclaimer: *"This summary was prepared by your doctor using MediNotes Pro. Please contact your doctor directly if you have any questions."*
- No PHI (protected health information) beyond what is in the approved draft.

---

### 4.3 Safety Checks & Escalation Flags

**Goal:** Surface potentially problematic content in AI-generated summaries to the reviewing doctor.

#### Functional Requirements
- Safety flags are generated as part of the structured JSON output (see 3.3) and stored in `summaries.structured_output`.
- If `safety_flags.has_flags = true`, a prominent warning banner is displayed in the review panel before the doctor can approve.
- The banner lists each flag type and description.
- The doctor must check an acknowledgement box ("I have reviewed and addressed all flagged items") before the "Approve & Send" button becomes active.
- Flag types:
  - `unclear_language` — notes contain ambiguous clinical language that may be misinterpreted.
  - `missing_follow_up` — no follow-up instructions are present despite indicators that one may be needed.
  - `risky_interpretation` — the summary contains an inference that goes beyond what was stated in the notes.
- Safety flags do **not** block generation; they block approval until acknowledged.

---

## 5. Phase 3 — Enhanced Input & Patient Features

### 5.1 Voice Input via Whisper

**Goal:** Allow doctors to dictate consultation notes by voice, reducing typing friction.

#### User Stories

| ID | Role | Story |
|---|---|---|
| US-12 | Doctor | I can click a microphone button to start dictating my consultation notes. |
| US-13 | Doctor | My spoken words are transcribed into the notes field in real time. |
| US-14 | Doctor | I can review and edit the transcription before generating a summary. |

#### Functional Requirements
- A microphone toggle button is added to the consultation notes field.
- On activation, audio is captured via the browser's `MediaRecorder` API and streamed to a new FastAPI endpoint `/api/transcribe`.
- The `/api/transcribe` endpoint calls the **OpenAI Whisper API** (`whisper-1`) and returns the transcription.
- The transcription is appended to (not replaces) any existing text in the notes field.
- The endpoint requires a valid Clerk JWT (same guard as `/api`).
- If microphone permission is denied, a clear error message is shown with guidance.

#### Non-Functional Requirements
- Audio data is not persisted on the server; it is streamed to Whisper and discarded.
- Maximum recording duration: 5 minutes per session (Whisper limit awareness).
- Whisper is selected over the Web Speech API for its superior accuracy with medical terminology.

---

### 5.2 Blood Results Interpreter (Patient-Facing)

**Goal:** Allow patients to upload or paste their blood test results and receive an AI-generated plain-language interpretation.

#### User Stories

| ID | Role | Story |
|---|---|---|
| US-15 | Patient | I can paste my blood test results into a form and receive a plain-language explanation. |
| US-16 | Patient | The explanation is empathetic, easy to understand, and always recommends I discuss the results with my doctor. |
| US-17 | Patient | I can see a history of my past interpretations. |

#### Functional Requirements
- A new patient-only route `/patient/results` is added, protected by role check.
- The patient pastes raw blood test result text into a textarea.
- On submission, the backend calls the LLM with a structured prompt and returns a JSON response containing:
  - `plain_language_summary`: overall interpretation in patient-friendly language.
  - `results`: array of `{ marker, value, reference_range, interpretation, tone }` where `tone` is one of `normal | monitor | discuss_with_doctor`.
  - `recommendation`: always includes a call to action to speak with their doctor.
- The response is rendered as a structured, readable report (not raw JSON).
- Results and their interpretations are stored against the patient's `user_id`.
- Tone guidelines enforced in the system prompt:
  - Empathetic, non-alarmist language.
  - No diagnosis or clinical conclusions.
  - For any `discuss_with_doctor` marker, emphasise the importance of follow-up.
- The feature is only available to users with `role = 'patient'`.

#### Non-Functional Requirements
- The LLM must be instructed to respond in JSON only; no free-form text.
- The prompt must explicitly prohibit diagnostic language.
- Response must be validated against the JSON schema before rendering.

---

## 6. Phase 4 — Quality & Compliance

### 6.1 Feedback Loop on Summaries

**Goal:** Capture doctor feedback on AI-generated summaries to inform future prompt improvements.

#### Functional Requirements
- After a summary has been sent (`status = 'sent'`), the doctor is shown a feedback prompt.
- Feedback consists of: a thumbs up / thumbs down rating, and an optional free-text comment (max 500 characters).
- Feedback is stored in a new `summary_feedback` table linked to `summaries.id`.
- Feedback data is accessible only to application administrators; it is never exposed in the patient-facing UI.

---

### 6.2 Audit Trail & Activity Log

**Goal:** Maintain a tamper-evident log of key system events for compliance and accountability.

#### Events to Log
| Event | Captured Data |
|---|---|
| Summary generated | `user_id`, `visit_id`, `summary_id`, timestamp |
| Summary approved | `user_id`, `summary_id`, timestamp |
| Email sent | `summary_id`, recipient email (hashed), timestamp |
| Patient linked to doctor | `doctor_id`, `patient_id`, timestamp |
| Consent recorded | `user_id`, timestamp |
| Blood result interpreted | `user_id`, timestamp |

#### Functional Requirements
- A new `audit_log` table stores all events with a `event_type`, `actor_id`, `resource_id`, and `metadata` (JSONB).
- Audit log rows are insert-only; no update or delete permissions are granted.
- Logs are viewable by administrators via Supabase dashboard at MVP; a UI can follow.

---

### 6.3 Rate Limiting

**Goal:** Prevent LLM API abuse and protect against runaway costs.

#### Functional Requirements
- Rate limits applied per `user_id` at the FastAPI middleware layer.
- Limits (configurable via environment variables):
  - Free tier: 5 summary generations per day.
  - Premium tier: 50 summary generations per day.
  - Voice transcription: 20 requests per day (premium only).
  - Blood results interpretation: 10 requests per day (patient accounts).
- On limit breach, return HTTP 429 with a clear message indicating when the limit resets.
- Rate limit counters stored in Supabase or a lightweight Redis instance.

---

## 7. Non-Functional Requirements (Global)

| Requirement | Detail |
|---|---|
| **Authentication** | All API endpoints require a valid Clerk JWT. Role is verified on every request. |
| **Authorisation** | Doctors can only access data linked to their `doctor_id`. Patients can only access their own data. |
| **Data at rest** | Supabase encryption at rest is enabled. |
| **Data in transit** | All traffic over HTTPS. |
| **Environment variables** | All secrets (Supabase, OpenAI, Resend, Clerk) stored as environment variables; never in code. |
| **Error handling** | All API errors return structured JSON `{ "error": "...", "code": "..." }`; no stack traces in production responses. |
| **HIPAA alignment** | No PHI in logs. Audit trail maintained. Data deletion process documented. BAA with Supabase and Resend to be established. |
| **Accessibility** | UI components must meet WCAG 2.1 AA standards. |

---

## 8. Out of Scope (Post-MVP)

The following features have been explicitly deferred:

- Multi-language support for patient communications.
- Lab PDF upload and RAG-based context injection.
- In-app patient portal (beyond email delivery).
- Fine-tuning or model customisation based on feedback data.
- Admin dashboard UI for audit logs and feedback.
- Mobile native app.

---

## 9. Open Questions

| # | Question | Owner |
|---|---|---|
| OQ-01 | Which email provider will be used — Resend or SendGrid? Recommendation: Resend for its developer experience and Next.js integration. | Engineering |
| OQ-02 | Will the app pursue formal HIPAA certification at MVP, or operate under best-effort compliance with a view to certification post-launch? | Product / Legal |
| OQ-03 | What is the data retention period for visit notes and summaries? Recommendation: 7 years, in line with standard medical record retention practices. | Product / Legal |
| OQ-04 | Should patients be notified when a doctor links them to their account? Recommendation: Yes, via an automated email. | Product |
| OQ-05 | Is there a need for a super-admin role (e.g. practice manager) in a future phase? | Product |