import { HttpError, json } from "./http"

interface TaskRow { id: string; title: string; due_at: number; completed_at: number | null; priority: "low" | "medium" | "high" }
interface ReminderRow { id: string; title: string; due_at: number; status: "pending" | "sent" | "cancelled" | "failed"; recurrence: "none" | "daily" | "weekly" | "monthly"; timezone: string }

export async function handleSchedule(request: Request, env: { DB: D1Database }, userId: string, pathname: string) {
  if (pathname !== "/api/schedule") return null
  if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
  const url = new URL(request.url)
  const start = Number(url.searchParams.get("start")), end = Number(url.searchParams.get("end"))
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 366 * 86_400) {
    throw new HttpError(400, "INVALID_RANGE", "Choose a valid schedule range of up to one year.")
  }
  const [tasks, reminders] = await Promise.all([
    env.DB.prepare("SELECT id, title, due_at, completed_at, priority FROM todos WHERE user_id = ? AND due_at >= ? AND due_at < ? ORDER BY due_at").bind(userId, start, end).all<TaskRow>(),
    env.DB.prepare("SELECT id, title, due_at, status, recurrence, timezone FROM reminders WHERE user_id = ? AND due_at >= ? AND due_at < ? ORDER BY due_at").bind(userId, start, end).all<ReminderRow>(),
  ])
  const events = [
    ...tasks.results.map((task) => ({ id: task.id, type: "task" as const, title: task.title, startsAt: task.due_at, status: task.completed_at ? "completed" : "pending", priority: task.priority })),
    ...reminders.results.map((reminder) => ({ id: reminder.id, type: "reminder" as const, title: reminder.title, startsAt: reminder.due_at, status: reminder.status, recurrence: reminder.recurrence, timezone: reminder.timezone })),
  ].sort((a, b) => a.startsAt - b.startsAt)
  return json({ data: events })
}
