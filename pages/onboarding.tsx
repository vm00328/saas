/**
 * pages/onboarding.tsx
 *
 * Shown to any authenticated Clerk user who does not yet have an
 * application record in the users table.
 *
 * Flow:
 *   1. If already registered, redirect to the appropriate home page.
 *   2. User selects a role (doctor or patient).
 *   3. User confirms their full name (email is pre-filled from Clerk,
 *      read-only).
 *   4. POST /api/users/register creates the record.
 *   5. Patients must accept T&Cs — POST /api/users/consent records the
 *      timestamp.
 *   6. Redirect to /dashboard (doctor) or /patient (patient).
 */

import { useState, useEffect, FormEvent } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { apiRequest, ApiError } from "@/lib/api";
import { UserRecord } from "@/hooks/useAppUser";

type Role = "doctor" | "patient";
type Step = "select_role" | "complete_profile";

export default function Onboarding() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("select_role");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill full name from Clerk if available
  useEffect(() => {
    if (user?.fullName) setFullName(user.fullName);
  }, [user]);

  // If already registered, redirect to the correct home page.
  // Prevents a registered user from accessing onboarding again.
  useEffect(() => {
    if (!isLoaded) return;
    apiRequest<UserRecord | null>("/api/users/me", getToken)
      .then((record) => {
        if (record?.role === "doctor") router.replace("/dashboard");
        if (record?.role === "patient") router.replace("/patient");
      })
      .catch(() => {
        // If the check fails, stay on the page — the user can proceed
        // with registration and the backend will handle duplicates.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // Extracted to a named handler to avoid inline block syntax inside JSX
  function handleBackToRoleSelect() {
    setStep("select_role");
    setError(null);
  }

  function handleRoleSelect(role: Role) {
    setSelectedRole(role);
    setStep("complete_profile");
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedRole) return;
    if (selectedRole === "patient" && !consentGiven) {
      setError("You must accept the Terms & Conditions to continue.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1 — register the user
      await apiRequest<UserRecord>("/api/users/register", getToken, {
        method: "POST",
        body: {
          email: user?.primaryEmailAddress?.emailAddress ?? "",
          full_name: fullName,
          role: selectedRole,
        },
      });

      // Step 2 — record consent for patients
      if (selectedRole === "patient") {
        await apiRequest<void>("/api/users/consent", getToken, {
          method: "POST",
        });
      }

      // Step 3 — redirect to the correct home page
      router.replace(selectedRole === "doctor" ? "/dashboard" : "/patient");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to MediNotes Pro
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Let us get your account set up.
          </p>
        </div>

        {/* Step 1 — Role selection */}
        {step === "select_role" && (
          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-6">
              Which best describes you?
            </p>
            <button
              onClick={() => handleRoleSelect("doctor")}
              className="w-full text-left p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <span className="block text-lg font-semibold text-gray-900 dark:text-gray-100">
                I am a Doctor
              </span>
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                I create consultation notes and send summaries to patients.
              </span>
            </button>
            <button
              onClick={() => handleRoleSelect("patient")}
              className="w-full text-left p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <span className="block text-lg font-semibold text-gray-900 dark:text-gray-100">
                I am a Patient
              </span>
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                I receive consultation summaries from my doctor.
              </span>
            </button>
          </div>
        )}

        {/* Step 2 — Profile completion */}
        {step === "complete_profile" && (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 space-y-6"
          >
            <button
              type="button"
              onClick={handleBackToRoleSelect}
              className="text-sm text-blue-600 hover:underline"
            >
              Back to role selection
            </button>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Registering as a{" "}
              <span className="font-semibold text-gray-800 dark:text-gray-200 capitalize">
                {selectedRole}
              </span>
            </p>

            {/* Full name */}
            <div className="space-y-1">
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Email — pre-filled from Clerk, not editable */}
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                disabled
                value={user?.primaryEmailAddress?.emailAddress ?? ""}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400">
                This is your Clerk account email and cannot be changed here.
              </p>
            </div>

            {/* T&C consent — patients only */}
            {selectedRole === "patient" && (
              <div className="flex items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label
                  htmlFor="consent"
                  className="text-sm text-gray-600 dark:text-gray-400"
                >
                  I have read and agree to the Terms and Conditions and Privacy
                  Policy. I understand my consultation data will be stored and
                  used to generate summaries.
                </label>
              </div>
            )}

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? "Setting up your account..." : "Complete Registration"}
            </button>
          </form>
        )}

      </div>
    </main>
  );
}