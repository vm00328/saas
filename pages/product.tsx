/**
 * pages/product.tsx
 *
 * Doctor-only consultation page. Protected by role and subscription.
 *
 * Responsibilities:
 *   - Present a form for the doctor to select a linked patient, choose a
 *     visit date, and enter consultation notes.
 *   - Submit to POST /api/consultations and display the structured
 *     AI-generated summary.
 *   - Render each section of the structured output independently:
 *       1. Doctor summary (read-only)
 *       2. Next steps for the doctor (read-only)
 *       3. Patient email draft (read-only — editing and approval in Phase 2)
 *       4. Safety flags (warning banner if any flags are present)
 *
 * Navigation:
 *   - Accessible from /dashboard via "New Consultation" button.
 *   - Accepts an optional `patient_id` query param to pre-select a patient.
 */

import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { Protect, PricingTable, UserButton } from "@clerk/nextjs";
import DatePicker from "react-datepicker";
import { useAppUser } from "@/hooks/useAppUser";
import { apiRequest, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types — mirror the Pydantic models in models/summary.py exactly
// ---------------------------------------------------------------------------

type FlagType =
  | "unclear_language"
  | "missing_follow_up"
  | "risky_interpretation";

type SafetyFlag = {
  type: FlagType;
  description: string;
};

type SafetyFlags = {
  has_flags: boolean;
  flags: SafetyFlag[];
};

type PatientEmailDraft = {
  subject: string;
  body: string;
};

type VisitSummary = {
  doctor_summary: string;
  next_steps_for_doctor: string[];
  patient_email_draft: PatientEmailDraft;
  safety_flags: SafetyFlags;
};

type ConsultationResponse = {
  visit_id: string;
  summary_id: string;
  structured_output: {
    visit_summary: VisitSummary;
  };
};

// Shape returned by GET /api/patients (Supabase join)
type LinkedPatient = {
  patient_id: string;
  users: {
    id: string;
    full_name: string;
    email: string;
  };
};

// Human-readable labels for each safety flag type
const FLAG_LABELS: Record<FlagType, string> = {
  unclear_language: "Unclear language",
  missing_follow_up: "Missing follow-up",
  risky_interpretation: "Risky interpretation",
};

// ---------------------------------------------------------------------------
// ConsultationForm — rendered inside the Protect subscription wrapper
// ---------------------------------------------------------------------------

function ConsultationForm() {
  const { appUser, loading: userLoading } = useAppUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();

  // Patient selector
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");

  // Form fields
  const [visitDate, setVisitDate] = useState<Date | null>(new Date());
  const [notes, setNotes] = useState("");

  // Submission state
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Structured output
  const [result, setResult] = useState<ConsultationResponse | null>(null);

  // Role guard
  useEffect(() => {
    if (userLoading || appUser === undefined) return;
    if (appUser?.role !== "doctor") router.replace("/patient");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, appUser]);

  // Fetch linked patients once Clerk auth and the user record are ready
  useEffect(() => {
    if (!authLoaded || !appUser || appUser.role !== "doctor") return;
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, appUser]);

  // Pre-select patient from query param once the patient list is loaded
  useEffect(() => {
    const queryPatientId = router.query.patient_id;
    if (
      typeof queryPatientId === "string" &&
      queryPatientId &&
      patients.length > 0
    ) {
      const match = patients.find((p) => p.users.id === queryPatientId);
      if (match) setSelectedPatientId(match.users.id);
    }
  }, [router.query.patient_id, patients]);

  async function fetchPatients() {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const data = await apiRequest<LinkedPatient[]>("/api/patients", getToken);
      setPatients(data ?? []);
    } catch (err) {
      setPatientsError(
        err instanceof ApiError
          ? `Failed to load patients (${err.status}): ${err.message}`
          : "Failed to load patients. Please refresh the page.",
      );
    } finally {
      setPatientsLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPatientId) {
      setSubmitError("Please select a patient.");
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setResult(null);

    try {
      const response = await apiRequest<ConsultationResponse>(
        "/api/consultations",
        getToken,
        {
          method: "POST",
          body: {
            patient_id: selectedPatientId,
            date_of_visit: visitDate?.toISOString().slice(0, 10),
            notes,
          },
        },
      );
      setResult(response);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (userLoading || appUser === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
          New Consultation
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Complete the form below to generate an AI-assisted summary.
        </p>
      </div>

      {/* Consultation form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6"
      >

        {/* Patient selector */}
        <div className="space-y-1">
          <label
            htmlFor="patient"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Patient
          </label>
          {patientsLoading && (
            <p className="text-sm text-gray-400">Loading patients...</p>
          )}
          {patientsError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {patientsError}
            </p>
          )}
          {!patientsLoading && !patientsError && (
            <select
              id="patient"
              required
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a patient</option>
              {patients.map((entry) => (
                <option key={entry.users.id} value={entry.users.id}>
                  {entry.users.full_name} ({entry.users.email})
                </option>
              ))}
            </select>
          )}
          {!patientsLoading && !patientsError && patients.length === 0 && (
            <p className="text-sm text-gray-400">
              No patients linked yet. Go to your{" "}
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="text-blue-600 hover:underline"
              >
                dashboard
              </button>{" "}
              to add a patient first.
            </p>
          )}
        </div>

        {/* Date of visit */}
        <div className="space-y-1">
          <label
            htmlFor="date"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Date of Visit
          </label>
          <DatePicker
            id="date"
            selected={visitDate}
            onChange={(d: Date | null) => setVisitDate(d)}
            dateFormat="yyyy-MM-dd"
            placeholderText="Select date"
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Consultation notes */}
        <div className="space-y-1">
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Consultation Notes
          </label>
          <textarea
            id="notes"
            required
            rows={8}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter detailed consultation notes..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Submit error */}
        {submitError && (
          <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? "Generating summary..." : "Generate Summary"}
        </button>
      </form>

      {/* Structured output — rendered only after a successful submission */}
      {result && (
        <div className="space-y-6">

          {/* Safety flags — shown first so the doctor sees them before
              reading the summary content */}
          {result.structured_output.visit_summary.safety_flags.has_flags && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-6">
              <h2 className="text-base font-semibold text-yellow-800 dark:text-yellow-300 mb-3">
                Review required — the following issues were flagged
              </h2>
              <ul className="space-y-2">
                {result.structured_output.visit_summary.safety_flags.flags.map(
                  (flag, index) => (
                    <li key={index} className="text-sm text-yellow-700 dark:text-yellow-300">
                      <span className="font-medium">
                        {FLAG_LABELS[flag.type]}:
                      </span>{" "}
                      {flag.description}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {/* Doctor summary */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Summary for Doctor Records
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {result.structured_output.visit_summary.doctor_summary}
            </p>
          </section>

          {/* Next steps */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Next Steps
            </h2>
            <ul className="space-y-2">
              {result.structured_output.visit_summary.next_steps_for_doctor.map(
                (step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="mt-0.5 text-blue-500 font-bold">
                      {index + 1}.
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ul>
          </section>

          {/* Patient email draft — read-only in Phase 1 */}
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Draft Email to Patient
              </h2>
              <span className="text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-full">
                Pending your review
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Review and approval of this email will be available in the next update. No email has been sent.
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Subject
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {result.structured_output.visit_summary.patient_email_draft.subject}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Body
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {result.structured_output.visit_summary.patient_email_draft.body}
                </p>
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product — subscription wrapper around ConsultationForm
// ---------------------------------------------------------------------------

export default function Product() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="absolute top-4 right-4">
        <UserButton showName />
      </div>

      <Protect
        plan="premium_subscription"
        fallback={
          <div className="container mx-auto px-4 py-12">
            <header className="text-center mb-12">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                Healthcare Professional Plan
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
                Streamline your patient consultations with AI-powered summaries
              </p>
            </header>
            <div className="max-w-4xl mx-auto">
              <PricingTable />
            </div>
          </div>
        }
      >
        <ConsultationForm />
      </Protect>
    </main>
  );
}