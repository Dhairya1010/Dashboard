import { HttpError, json } from "./http"

interface SettingsRecord { timezone: string; week_starts_on: number; default_task_priority: "low" | "medium" | "high"; updated_at: number }
const priorities = new Set(["low", "medium", "high"])
function timezoneValid(value: string) { try { Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } }
function serialize(row: SettingsRecord) { return { timezone: row.timezone, weekStartsOn: row.week_starts_on, defaultTaskPriority: row.default_task_priority, updatedAt: row.updated_at } }

export async function handleSettings(request: Request, env: { DB: D1Database }, user: { id: string; role: string }, pathname: string) {
  if (pathname !== "/api/settings") return null
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT timezone, week_starts_on, default_task_priority, updated_at FROM settings WHERE user_id = ?").bind(user.id).first<SettingsRecord>()
    if (!row) throw new HttpError(404, "NOT_FOUND", "Settings not found.")
    return json({ data: serialize(row) })
  }
  if (request.method === "PATCH") {
    if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.")
    if ((Number(request.headers.get("Content-Length")) || 0) > 4096) throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.")
    let input: Record<string, unknown>; try { input = await request.json() as Record<string, unknown> } catch { throw new HttpError(400, "INVALID_INPUT", "Enter valid settings.") }
    const assignments: string[] = [], values: unknown[] = []
    if ("timezone" in input) { if (typeof input.timezone !== "string" || input.timezone.length > 100 || !timezoneValid(input.timezone)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid timezone."); assignments.push("timezone = ?"); values.push(input.timezone) }
    if ("weekStartsOn" in input) { if (input.weekStartsOn !== 0 && input.weekStartsOn !== 1) throw new HttpError(400, "INVALID_INPUT", "Choose a valid first day of the week."); assignments.push("week_starts_on = ?"); values.push(input.weekStartsOn) }
    if ("defaultTaskPriority" in input) { if (typeof input.defaultTaskPriority !== "string" || !priorities.has(input.defaultTaskPriority)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid default priority."); assignments.push("default_task_priority = ?"); values.push(input.defaultTaskPriority) }
    if (!assignments.length) throw new HttpError(400, "INVALID_INPUT", "No settings changes were provided.")
    assignments.push("updated_at = unixepoch()")
    await env.DB.prepare(`UPDATE settings SET ${assignments.join(", ")} WHERE user_id = ?`).bind(...values, user.id).run()
    const updated = await env.DB.prepare("SELECT timezone, week_starts_on, default_task_priority, updated_at FROM settings WHERE user_id = ?").bind(user.id).first<SettingsRecord>()
    return json({ data: serialize(updated!) })
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
}
