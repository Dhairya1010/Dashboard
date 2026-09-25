import { ApiError } from "./api"

export type ScheduleEvent = {
  id: string
  type: "task" | "reminder"
  title: string
  startsAt: number
  status: string
  priority?: "low" | "medium" | "high"
  recurrence?: "none" | "daily" | "weekly" | "monthly"
  timezone?: string
}

export async function getSchedule(start: number, end: number, signal?: AbortSignal) {
  const response = await fetch(`/api/schedule?start=${start}&end=${end}`, { signal, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The schedule could not be loaded.")
  return body.data as ScheduleEvent[]
}
