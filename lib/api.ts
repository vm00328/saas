/**
 * lib/api.ts
 *
 * Shared API client for all authenticated requests to the FastAPI backend.
 *
 * All endpoints require a valid Clerk JWT passed as a Bearer token.
 * This utility centralises token retrieval and fetch logic so individual components never handle auth headers directly.
 *
 * Usage:
 *   const data = await apiRequest<UserRecord>(
 *     "/api/users/me",
 *     getToken
 *   );
 *
 *   const result = await apiRequest<SummaryResponse>(
 *     "/api/consultations",
 *     getToken,
 *     { method: "POST", body: { patient_id, date_of_visit, notes } }
 *   );
 */

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Not authenticated");

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // Return null for empty responses (e.g. 201 with no body)
  if (response.status === 204) return null as T;

  const data = await response.json().catch(() => ({
    detail: "An unexpected error occurred",
  }));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.detail ?? `Request failed with status ${response.status}`,
    );
  }

  return data as T;
}