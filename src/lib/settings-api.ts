import { ApiError } from "./api"
export interface Settings { timezone: string; weekStartsOn: 0 | 1; defaultTaskPriority: "low" | "medium" | "high"; updatedAt: number }
async function request<T>(init: RequestInit = {}) { const response = await fetch("/api/settings", { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers } }); const body = await response.json().catch(() => null); if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed."); return body.data as T }
export const getSettings = (signal?: AbortSignal) => request<Settings>({ signal })
export const updateSettings = (input: Partial<Pick<Settings, "timezone" | "weekStartsOn" | "defaultTaskPriority">>) => request<Settings>({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
