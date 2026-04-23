/**
 * pages/dashboard.tsx
 *
 * Doctor-only home page. Protected — redirects to /patient if the
 * authenticated user is not a doctor, and to /onboarding if they
 * have no app record (handled by useAppUser).
 *
 * Responsibilities:
 *   - Display all patients linked to the authenticated doctor.
 *   - Allow the doctor to search for a patient by email and link them.
 *   - Navigate to /product with a pre-selected patient for a new
 *     consultation.
 */

import { useState, useEffect, useRef, FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { UserButton } from "@clerk/nextjs";
import { useAppUser } from "@/hooks/useAppUser";
import { apiRequest, ApiError } from "@/lib/api";

// Shape returned by GET /api/patients (Supabase join)
type LinkedPatient = {
  patient_id: string;
  users: {
    id: string;
    full_name: string;
    email: string;
  };
};

// Shape returned by GET /api/patients/search
type PatientSearchResult = {
  id: string;
  email: string;
};

export default function Dashboard() {
  const { appUser, loading: userLoading } = useAppUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();

  // Patient list state — distinguishes between a failed fetch and an
  // empty list so the UI can surface real errors rather than silently
  // showing "no patients linked yet" on a 500.
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  // Tracks the id of a patient who was just linked so their row can
  // be highlighted and scrolled into view after the list refreshes.
  const [newlyLinkedId, setNewlyLinkedId] = useState<string | null>(null);
  const newlyLinkedRef = useRef<HTMLLIElement | null>(null);

  // Search state
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<PatientSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Link state
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [linking, setLinking] = useState(false);

  // Role guard — redirect non-doctors away
  useEffect(() => {
    if (userLoading || appUser === undefined) return;
    if (appUser?.role !== "doctor") router.replace("/patient");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, appUser]);

  // Fetch linked patients once the user is confirmed as a doctor AND
  // Clerk auth is fully loaded. Both guards are required — appUser
  // confirms role, authLoaded confirms getToken will return a valid token.
  useEffect(() => {
    if (!authLoaded || !appUser || appUser.role !== "doctor") return;
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, appUser]);

  // Scroll the newly linked patient row into view once the list re-renders
  useEffect(() => {
    if (newlyLinkedId && newlyLinkedRef.current) {
      newlyLinkedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [newlyLinkedId, patients]);

  async function fetchPatients() {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const data = await apiRequest<LinkedPatient[]>("/api/patients", getToken);
      setPatients(data ?? []);
    } catch (err) {
      // Distinguish between a real failure and an empty list.
      // An empty list is returned as [] with a 200 — it never reaches here.
      // Anything that throws is a genuine backend or auth error.
      setPatients([]);
      setPatientsError(
        err instanceof ApiError
          ? `Failed to load patients (${err.status}): ${err.message}`
          : "Failed to load patients. Please refresh the page.",
      );
    } finally {
      setPatientsLoading(false);
    }
  }

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearchResult(null);
    setSearchError(null);
    setLinkError(null);
    setLinkSuccess(false);
    setSearching(true);

    try {
      const result = await apiRequest<PatientSearchResult>(
        `/api/patients/search?email=${encodeURIComponent(searchEmail)}`,
        getToken,
      );
      setSearchResult(result);
    } catch (err) {
      setSearchError(
        err instanceof ApiError
          ? err.message
          : "Search failed. Please try again.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleLink() {
    if (!searchResult) return;
    setLinkError(null);
    setLinkSuccess(false);
    setLinking(true);

    try {
      await apiRequest(
        `/api/patients/${searchResult.id}/link`,
        getToken,
        { method: "POST" },
      );

      // Store the newly linked id before refreshing so the row can be
      // highlighted and scrolled into view once the list re-renders.
      setNewlyLinkedId(searchResult.id);
      setLinkSuccess(true);
      setSearchResult(null);
      setSearchEmail("");
      await fetchPatients();
    } catch (err) {
      setLinkError(
        err instanceof ApiError
          ? err.message
          : "Failed to link patient. Please try again.",
      );
    } finally {
      setLinking(false);
    }
  }

  function handleNewConsultation(patientId: string) {
    router.push(`/product?patient_id=${patientId}`);
  }

  if (userLoading || appUser === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          MediNotes Pro
        </h1>
        <UserButton showName />
      </div>

      <div className="container mx-auto px-4 py-10 max-w-4xl space-y-10">

        {/* Page heading */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Doctor Dashboard
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your patients and create consultations.
          </p>
        </div>

        {/* My Patients */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            My Patients
          </h3>

          {patientsLoading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading patients...
            </p>
          )}

          {/* Real fetch error — distinguished from an empty list */}
          {!patientsLoading && patientsError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">
                {patientsError}
              </p>
              <button
                onClick={fetchPatients}
                className="text-sm text-red-700 dark:text-red-300 underline mt-1"
              >
                Try again
              </button>
            </div>
          )}

          {/* Genuinely empty list — no error */}
          {!patientsLoading && !patientsError && patients.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No patients linked yet. Use the form below to add a patient.
            </p>
          )}

          {!patientsLoading && !patientsError && patients.length > 0 && (
            <ul className="space-y-3">
              {patients.map((entry) => {
                const isNew = entry.users.id === newlyLinkedId;
                return (
                  <li
                    key={entry.patient_id}
                    ref={isNew ? newlyLinkedRef : null}
                    className={[
                      "flex items-center justify-between rounded-xl px-6 py-4 shadow-sm border transition-colors",
                      isNew
                        ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                    ].join(" ")}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {entry.users.full_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {entry.users.email}
                      </p>
                      {isNew && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          Just linked
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleNewConsultation(entry.users.id)}
                      className={[
                        "text-sm font-medium py-2 px-4 rounded-lg transition-colors text-white",
                        isNew
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-blue-600 hover:bg-blue-700",
                      ].join(" ")}
                    >
                      New Consultation
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Add Patient */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Add a Patient
          </h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Search for a patient by their registered email address.
            </p>

            {/* Search form */}
            <form onSubmit={handleSearch} className="flex gap-3">
              <input
                type="email"
                required
                placeholder="patient@example.com"
                value={searchEmail}
                onChange={(e) => {
                  setSearchEmail(e.target.value);
                  setSearchResult(null);
                  setSearchError(null);
                  setLinkError(null);
                  setLinkSuccess(false);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <button
                type="submit"
                disabled={searching}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-5 rounded-lg transition-colors"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            {/* Search error */}
            {searchError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {searchError}
              </p>
            )}

            {/* Search result — awaiting link confirmation */}
            {searchResult && (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  {searchResult.email}
                </p>
                <button
                  onClick={handleLink}
                  disabled={linking}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {linking ? "Linking..." : "Add Patient"}
                </button>
              </div>
            )}

            {/* Link error */}
            {linkError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {linkError}
              </p>
            )}

            {/* Link success — guides doctor to the next action */}
            {linkSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Patient successfully added. Their row is highlighted above when you are ready to start a consultation.
              </p>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}