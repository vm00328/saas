/**
 * hooks/useAppUser.ts
 *
 * Fetches the authenticated user's application profile from the backend
 * (GET /api/users/me) and handles the three possible states every protected page needs to respond to:
 *
 *   loading  - Clerk or the API call has not resolved yet.
 *   null     - User is authenticated with Clerk but has no app record.
 *              -> Redirect to /onboarding.
 *   UserRecord - User is registered. Role is available for route protection.
 *              -> Redirect away if wrong role for this page.
 *
 * Usage in a protected page:
 *   const { appUser, loading } = useAppUser();
 *
 *   useEffect(() => {
 *     if (loading || !appUser) return;
 *     if (appUser.role !== "doctor") router.replace("/patient");
 *   }, [loading, appUser]);
 */

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { apiRequest, ApiError } from "@/lib/api";

export type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: "doctor" | "patient";
  consent_given_at: string | null;
  created_at: string;
};

export function useAppUser() {
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const [appUser, setAppUser] = useState<UserRecord | null | undefined>(
    // undefined = still loading; null = loaded but not registered
    undefined,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    // Not signed in at all - redirect to home
    if (!isSignedIn) {
      router.replace("/");
      return;
    }

    apiRequest<UserRecord | null>("/api/users/me", getToken)
      .then((user) => {
        setAppUser(user);
        // No app record yet - send to onboarding
        // (skip this redirect if we are already on /onboarding)
        if (!user && router.pathname !== "/onboarding") {
          router.replace("/onboarding");
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/");
        }
      })
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  return { appUser, loading };
}