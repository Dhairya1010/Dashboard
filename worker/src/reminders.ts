import { HttpError, json } from "./http"

export interface ReminderUser { id: string; role: string }
interface ReminderRecord { id: string; title: string; due_at: number; timezone: string; recurrence: "none" | "daily" | "weekly" | "monthly"; status: "pending" | "sent" | "cancelled" | "failed"; created_at: number; updated_at: number }
const recurrences = new Set(["none", "daily", "weekly", "monthly"])
const statuses = new Set(["pending", "cancelled"])

function canWrite(user: ReminderUser) { if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.") }
async function readBody(request: Request) {
  if ((Number(request.headers.get("Content-Length")) || 0) > 16_384) throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.")
  try { return await request.json() as Record<string, unknown> } catch { throw new HttpError(400, "INVALID_INPUT", "Enter valid reminder details.") }
}
function timezoneValid(value: string) { try { Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } }
function fields(input: Record<string, unknown>, partial = false) {
  const output: { title?: string; dueAt?: number; timezone?: string; recurrence?: string; status?: string } = {}
  if (!partial || "title" in input) {
    if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 200) throw new HttpError(400, "INVALID_INPUT", "Reminder titles must be between 1 and 200 characters.")
    output.title = input.title.trim()
  }
  if (!partial || "dueAt" in input) {
    if (typeof input.dueAt !== "number" || !Number.isSafeInteger(input.dueAt) || input.dueAt < 0) throw new HttpError(400, "INVALID_INPUT", "Choose a valid reminder date and time.")
    output.dueAt = input.dueAt
  }
  if (!partial || "timezone" in input) {
    if (typeof input.timezone !== "string" || input.timezone.length > 100 || !timezoneValid(input.timezone)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid timezone.")
    output.timezone = input.timezone
  }
  if (!partial || "recurrence" in input) {
    if (typeof input.recurrence !== "string" || !recurrences.has(input.recurrence)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid recurrence.")
    output.recurrence = input.recurrence
  }
  if ("status" in input) {
    if (typeof input.status !== "string" || !statuses.has(input.status)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid reminder status.")
    output.status = input.status
  }
  if (partial && Object.keys(output).length === 0) throw new HttpError(400, "INVALID_INPUT", "No reminder changes were provided.")
  return output
}
function serialize(row: ReminderRecord) { return { id: row.id, title: row.title, dueAt: row.due_at, timezone: row.timezone, recurrence: row.recurrence, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } }

export async function handleReminders(request: Request, env: { DB: D1Database }, user: ReminderUser, pathname: string) {
  const match = pathname.match(/^\/api\/reminders(?:\/([0-9a-f-]+))?$/i)
  if (!match) return null
  const id = match[1]
  if (request.method === "GET" && !id) {
    const rows = await env.DB.prepare("SELECT id, title, due_at, timezone, recurrence, status, created_at, updated_at FROM reminders WHERE user_id = ? ORDER BY status != 'pending', due_at").bind(user.id).all<ReminderRecord>()
    return json({ data: rows.results.map(serialize) })
  }
  if (request.method === "POST" && !id) {
    canWrite(user); const input = fields(await readBody(request)); const reminderId = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO reminders (id, user_id, title, due_at, timezone, recurrence) VALUES (?, ?, ?, ?, ?, ?)").bind(reminderId, user.id, input.title, input.dueAt, input.timezone, input.recurrence).run()
    const created = await env.DB.prepare("SELECT id, title, due_at, timezone, recurrence, status, created_at, updated_at FROM reminders WHERE id = ? AND user_id = ?").bind(reminderId, user.id).first<ReminderRecord>()
    return json({ data: serialize(created!) }, 201)
  }
  if (request.method === "PATCH" && id) {
    canWrite(user); const input = fields(await readBody(request), true)
    if (!await env.DB.prepare("SELECT id FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Reminder not found.")
    const assignments: string[] = []; const values: unknown[] = []; const columns = { title: "title", dueAt: "due_at", timezone: "timezone", recurrence: "recurrence", status: "status" } as const
    for (const [key, column] of Object.entries(columns) as Array<[keyof typeof columns, string]>) if (key in input) { assignments.push(`${column} = ?`); values.push(input[key]) }
    assignments.push("updated_at = unixepoch()")
    await env.DB.prepare(`UPDATE reminders SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values, id, user.id).run()
    const updated = await env.DB.prepare("SELECT id, title, due_at, timezone, recurrence, status, created_at, updated_at FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id).first<ReminderRecord>()
    return json({ data: serialize(updated!) })
  }
  if (request.method === "DELETE" && id) {
    canWrite(user)
    if (!await env.DB.prepare("SELECT id FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Reminder not found.")
    await env.DB.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id).run(); return new Response(null, { status: 204 })
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
}
