# MediNotes Pro — Design Decisions & Feature Summary

**Last Updated:** April 2026  
**Purpose:** Reference document summarising key design decisions, feature rationale, and architectural choices made during the initial planning phase. Use this as a companion to the PRD.

---

## 1. Current State of the App

The app is a working but minimal product. It allows an authenticated, subscribed doctor to enter a patient name, visit date, and consultation notes, and receive an AI-generated summary delivered via real-time streaming. There is no database, no user roles, and no persistence — every generated summary disappears once the stream ends.

**Stack:**
- Frontend: Next.js (Page Router), TypeScript
- Backend: FastAPI (Python)
- Auth & Billing: Clerk
- AI: OpenAI (`gpt-4o-mini` / equivalent)
- Deployment: Vercel

**Critical gap identified:** The absence of a database is the single most important constraint on what can be built next. Almost every planned feature requires persistence, and this must be addressed before anything else.

---

## 2. Database

**Decision: Supabase (PostgreSQL)**

Supabase was chosen over alternatives (Neon + SQLModel, PlanetScale) for the following reasons:
- Managed Postgres with a generous free tier suitable for MVP.
- Built-in dashboard for data inspection without a custom admin UI.
- Row-level security (RLS) enforced at the database layer, which aligns well with healthcare data isolation requirements.
- Fast path to production — the primary criterion given familiarity with the existing stack.

Neon + SQLModel was considered as a strong alternative (SQLModel is built by the FastAPI author, giving seamless type safety), but was ruled out due to the unfamiliarity with both tools.

**Key schema decisions:**
- The `users.id` primary key mirrors the Clerk `user_id` (`sub` claim from the JWT), avoiding a separate mapping table.
- `summaries.structured_output` is stored as JSONB, giving flexibility to evolve the schema without migrations as the output format matures.
- `summaries.status` is an enum (`pending_review → approved → sent`) that gates what actions are permitted at each stage.
- The `audit_log` table is insert-only by design — no update or delete permissions are granted, making it tamper-evident.

---

## 3. User Roles & Profiles

**Decision: Two roles — `doctor` and `patient`. Patients self-register.**

The original app assumed a single user type (doctor). The expanded model introduces a patient role with the following design choices:

- Role is selected by the user on first sign-in via a role selection screen, written to the `users` table, and cannot be self-changed afterwards.
- Patients create their own accounts independently — they are not invited or created by a doctor. A doctor links to an existing patient by searching for their registered email address.
- A `doctor_patient_links` join table manages the many-to-many relationship between doctors and patients.
- Route protection is enforced at both the frontend (Clerk's `Protect`) and backend (JWT role claim check), ensuring doctors cannot access patient routes and vice versa.

**Notable considerations:**
- Patient search returns only email until the link is established, to minimise PII exposure.
- The question of whether patients should receive a notification email when a doctor links them is an open question (OQ-04 in the PRD) — the recommendation is yes, for both trust and GDPR alignment.

---

## 4. Structured JSON Output

**Decision: Replace streaming markdown with a validated JSON schema response.**

The current implementation streams a free-form markdown response with hardcoded section headings. This is fragile — downstream features (approval workflow, safety flags, email sending, blood results rendering) all require reliable, machine-readable output.

**The agreed JSON schema shape:**

```json
{
  "visit_summary": {
    "doctor_summary": "string",
    "next_steps_for_doctor": ["string"],
    "patient_email_draft": {
      "subject": "string",
      "body": "string"
    },
    "safety_flags": {
      "has_flags": "boolean",
      "flags": [
        {
          "type": "unclear_language | missing_follow_up | risky_interpretation",
          "description": "string"
        }
      ]
    }
  }
}
```

**Key decision — streaming is dropped (temporarily):** Parsing a structured JSON response mid-stream is complex and brittle. The decision was made to switch to a standard request/response pattern for Phase 1. Streaming can be reintroduced in a later phase once the schema is stable and if UX feedback demands it.

**Validation:** The backend must validate every LLM response against the schema before persisting or returning it. Malformed responses trigger up to 2 retries before returning a 500 error.

---

## 5. Safety Checks & Escalation Flags

**Decision: Flags embedded in structured output; no confidence scores at this stage.**

Rather than a separate post-processing step or a rules-based scan, safety flags are generated as part of the structured JSON output. This keeps the implementation simple and keeps all AI reasoning in one call.

Three flag types were defined:
- `unclear_language` — ambiguous clinical language that may be misinterpreted.
- `missing_follow_up` — no follow-up instructions despite indicators that one may be needed.
- `risky_interpretation` — the summary infers something beyond what was stated in the notes.

**Key decision — no confidence scores at MVP:** A confidence level per flag was considered but ruled out for now to keep the initial implementation simple and avoid presenting doctors with numerical scores that could be misread or misused clinically.

**Flags block approval, not generation.** A flagged summary can still be generated and reviewed; the doctor is simply required to acknowledge the flags before the "Approve & Send" button becomes active.

---

## 6. Review & Approval Workflow

**Decision: Human-in-the-loop is mandatory. No summary is ever auto-sent.**

This is the most important trust and safety decision in the clinical workflow. The design is:

1. Doctor generates a summary → status: `pending_review`.
2. Doctor is presented with a review panel showing all sections separately.
3. The patient email draft is editable inline; edits are saved back to the database before approval.
4. If safety flags exist, the doctor must acknowledge them before proceeding.
5. Doctor clicks "Approve & Send" → status: `approved`, then email is dispatched → status: `sent`.

**Key design details:**
- Doctor-only content (clinical summary, next steps) is visually separated from patient-facing content (email draft).
- The approval button is disabled until the doctor has acknowledged all sections/flags.
- Edit history is not required at MVP, but the final approved state is always persisted.

---

## 7. Patient Email Delivery

**Decision: Resend as the email provider (recommended); SendGrid as the alternative.**

Resend was recommended over SendGrid for its developer experience and native Vercel/Next.js integration. This remains an open question (OQ-01) pending a final product decision.

**Key design rules:**
- Patient email address is always fetched from `users.email` — it is never manually entered by a doctor.
- Email sending is a backend-only operation; the API key is never exposed to the frontend.
- On delivery failure, the error is logged and the doctor is notified in-app; the summary status remains `approved` so a retry is possible.
- Every patient email includes a footer disclaimer distancing the summary from a formal clinical document and directing the patient to contact their doctor with questions.
- A Business Associate Agreement (BAA) must be established with the email provider before any PHI is transmitted.

---

## 8. Voice Input

**Decision: OpenAI Whisper API over the Web Speech API.**

Whisper was chosen over the browser-native Web Speech API specifically for its superior accuracy with medical terminology. The implementation approach:

- Audio is captured via the browser's `MediaRecorder` API.
- Audio data is streamed to a new FastAPI endpoint (`/api/transcribe`) and forwarded to the Whisper API.
- Audio is not persisted server-side at any point.
- Transcription is appended to (not replaces) existing notes text, giving the doctor full control.
- Maximum recording duration: 5 minutes per session.

This feature is relatively self-contained and does not depend on Phase 1 or 2 features, making it a good parallel workstream if capacity allows.

---

## 9. Blood Results Interpreter (Patient-Facing)

**Decision: Structured JSON output with strictly non-diagnostic, empathetic tone.**

This is the primary patient-facing feature. The design constraints are:

- Available only to users with `role = 'patient'`.
- The LLM is instructed to return structured JSON only — free-form responses are not permitted.
- The output schema includes a `tone` field per result marker (`normal | monitor | discuss_with_doctor`), enabling the frontend to render visual cues (e.g. colour coding) without additional logic.
- The system prompt explicitly prohibits diagnostic language and clinical conclusions.
- Every response includes a recommendation to speak with the doctor, regardless of results.
- Interpretations are stored against the patient's record for history.

---

## 10. Patient Consent

**Decision: Active consent checkbox at account creation; timestamp stored in the database.**

Consent is tied to the patient's first sign-in flow (role selection screen). The implementation rules:

- Pre-checked boxes are not permitted.
- The patient must actively check a box agreeing to the Terms & Conditions and Privacy Policy.
- `users.consent_given_at` is set on acceptance; no patient health data may be stored or transmitted until this field is non-null.
- A documented data deletion process must exist before launch, even if it is a manual process at MVP.

---

## 11. Audit Trail

**Decision: Insert-only `audit_log` table; UI deferred to post-MVP.**

Key events to log: summary generation, approval, email dispatch, patient-doctor linking, consent recording, and blood result interpretation.

Each row stores: `event_type`, `actor_id`, `resource_id`, and a `metadata` JSONB field. The insert-only constraint is enforced at the database permission level, making the log tamper-evident. A UI for viewing logs is deferred; the Supabase dashboard serves as the access point at MVP.

---

## 12. Rate Limiting

**Decision: Per-user rate limits enforced at the FastAPI middleware layer.**

Limits by tier:

| Feature | Free | Premium |
|---|---|---|
| Summary generation | 5/day | 50/day |
| Voice transcription | — | 20/day |
| Blood results interpretation | 10/day (patient accounts) | — |

Counters stored in Supabase or a lightweight Redis instance. Limit breach returns HTTP 429 with a reset time.

---

## 13. Features Explicitly Deferred

The following features were discussed and deliberately excluded from the MVP roadmap:

| Feature | Reason for Deferral |
|---|---|
| Multi-language support | App launches in English-speaking market only; language field can be added to the patient profile later. |
| Lab PDF upload | Complex RAG implementation; deferred until core workflow is stable. |
| Feedback loop (thumbs up/down on summaries) | Low priority for MVP; data has value once volume exists. |
| In-app patient portal | Email delivery is sufficient for MVP; a portal adds auth complexity for patients. |
| Formal HIPAA certification | Best-effort compliance at MVP; certification to follow post-launch (OQ-02). |
| Admin dashboard UI | Supabase dashboard is sufficient at MVP scale. |

---

## 14. Open Questions

These questions were identified during planning and require a decision before or during the relevant phase:

| # | Question | Phase | Recommendation |
|---|---|---|---|
| OQ-01 | Email provider: Resend or SendGrid? | Phase 2 | Resend — better DX, Vercel-native. |
| OQ-02 | HIPAA: best-effort compliance at MVP or pursue formal certification? | Pre-launch | Best-effort MVP; certify post-launch. |
| OQ-03 | Data retention period for visit notes and summaries? | Phase 1 | 7 years, in line with standard medical record retention. |
| OQ-04 | Should patients receive a notification email when a doctor links them? | Phase 1 | Yes — trust and GDPR alignment. |
| OQ-05 | Is a super-admin / practice manager role needed in future? | Post-MVP | To be scoped in a later PRD. |

---

## 15. Agreed Prioritisation Phases

```
Phase 1 — Foundations
  └── Database setup (Supabase)
  └── Doctor & patient user profiles
  └── Structured JSON output
  └── Patient consent management

Phase 2 — Core Clinical Workflow
  └── Review & approval workflow
  └── Send summary to patient email
  └── Safety checks & escalation flags

Phase 3 — Enhanced Input & Patient Features
  └── Voice input via Whisper
  └── Blood results interpreter (patient-facing)

Phase 4 — Quality & Compliance
  └── Feedback loop on summaries
  └── Audit trail & activity log
  └── Rate limiting at feature level
```

The dependency chain that drove this ordering:

> **Structured output → Patient profiles + consent → Review/approval workflow → Email delivery → Safety flags**

Voice input and the blood results interpreter are relatively self-contained and could run as parallel workstreams from Phase 2 onwards if capacity allows.