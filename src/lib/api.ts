export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function apiGet<T>(path: `/api/${string}`, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal })
}

async function apiRequest<T>(path: `/api/${string}`, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers },
  })
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(response.status, "INVALID_RESPONSE", "The API returned an unexpected response.")
  }
  const body = await response.json()
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "The request failed.")
  return body.data as T
}

export interface Session {
  user: { id: string; email: string; role: "owner" | "admin" | "member" | "viewer" }
  environment: string
}

export const getSession = (signal?: AbortSignal) => apiGet<Session>("/api/session", signal)
export const getAuthConfig = (signal?: AbortSignal) => apiGet<{ mode: "access" | "password" }>("/api/auth/config", signal)
export const passwordSignIn = (email: string, password: string) => apiRequest<Session>("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
})
export const passwordSignOut = () => apiRequest<{ signedOut: true }>("/api/auth/logout", { method: "POST" })
export const accessLogoutUrl = "/cdn-cgi/access/logout"
