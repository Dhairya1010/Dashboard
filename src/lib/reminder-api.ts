import { ApiError } from "./api"
export interface Reminder { id: string; title: string; dueAt: number; timezone: string; recurrence: "none" | "daily" | "weekly" | "monthly"; status: "pending" | "sent" | "cancelled" | "failed"; createdAt: number; updatedAt: number }
export type ReminderInput = Pick<Reminder, "title" | "dueAt" | "timezone" | "recurrence">
async function request<T>(path: string, init: RequestInit = {}) { const response = await fetch(path, { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers } }); if (response.status === 204) return undefined as T; const body = await response.json().catch(() => null); if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed."); return body.data as T }
export const getReminders = (signal?: AbortSignal) => request<Reminder[]>("/api/reminders", { signal })
export const createReminder = (input: ReminderInput) => request<Reminder>("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const updateReminder = (id: string, input: Partial<ReminderInput> & { status?: "pending" | "cancelled" }) => request<Reminder>(`/api/reminders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const deleteReminder = (id: string) => request<void>(`/api/reminders/${id}`, { method: "DELETE" })
