import { HttpError, json } from "./http"

export interface TodoUser { id: string; role: string }
interface TodoRecord { id: string; title: string; description: string; priority: "low" | "medium" | "high"; due_at: number | null; completed_at: number | null; created_at: number; updated_at: number }
const priorities = new Set(["low", "medium", "high"])

function canWrite(user: TodoUser) {
  if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.")
}

async function readBody(request: Request) {
  if ((Number(request.headers.get("Content-Length")) || 0) > 16_384) throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.")
  try { return await request.json() as Record<string, unknown> }
  catch { throw new HttpError(400, "INVALID_INPUT", "Enter valid task details.") }
}

function parseFields(input: Record<string, unknown>, partial = false) {
  const result: { title?: string; description?: string; priority?: string; dueAt?: number | null; completed?: boolean } = {}
  if (!partial || "title" in input) {
    if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 200) throw new HttpError(400, "INVALID_INPUT", "Task titles must be between 1 and 200 characters.")
    result.title = input.title.trim()
  }
  if (!partial || "description" in input) {
    if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 10_000)) throw new HttpError(400, "INVALID_INPUT", "Task descriptions must be 10,000 characters or fewer.")
    result.description = typeof input.description === "string" ? input.description.trim() : ""
  }
  if (!partial || "priority" in input) {
    if (input.priority !== undefined && (typeof input.priority !== "string" || !priorities.has(input.priority))) throw new HttpError(400, "INVALID_INPUT", "Choose a valid task priority.")
    result.priority = typeof input.priority === "string" ? input.priority : "medium"
  }
  if (!partial || "dueAt" in input) {
    if (input.dueAt !== null && input.dueAt !== undefined && (typeof input.dueAt !== "number" || !Number.isSafeInteger(input.dueAt) || input.dueAt < 0)) throw new HttpError(400, "INVALID_INPUT", "Choose a valid due date.")
    result.dueAt = typeof input.dueAt === "number" ? input.dueAt : null
  }
  if ("completed" in input) {
    if (typeof input.completed !== "boolean") throw new HttpError(400, "INVALID_INPUT", "Completion must be true or false.")
    result.completed = input.completed
  }
  if (partial && Object.keys(result).length === 0) throw new HttpError(400, "INVALID_INPUT", "No task changes were provided.")
  return result
}

function serialize(todo: TodoRecord) {
  return { id: todo.id, title: todo.title, description: todo.description, priority: todo.priority, dueAt: todo.due_at, completedAt: todo.completed_at, createdAt: todo.created_at, updatedAt: todo.updated_at }
}

export async function handleTodos(request: Request, env: { DB: D1Database }, user: TodoUser, pathname: string) {
  const match = pathname.match(/^\/api\/todos(?:\/([0-9a-f-]+))?$/i)
  if (!match) return null
  const id = match[1]
  if (request.method === "GET" && !id) {
    const rows = await env.DB.prepare("SELECT id, title, description, priority, due_at, completed_at, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY completed_at IS NOT NULL, due_at IS NULL, due_at, created_at DESC").bind(user.id).all<TodoRecord>()
    return json({ data: rows.results.map(serialize) })
  }
  if (request.method === "POST" && !id) {
    canWrite(user)
    const fields = parseFields(await readBody(request))
    const todoId = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO todos (id, user_id, title, description, priority, due_at) VALUES (?, ?, ?, ?, ?, ?)").bind(todoId, user.id, fields.title, fields.description, fields.priority, fields.dueAt).run()
    const created = await env.DB.prepare("SELECT id, title, description, priority, due_at, completed_at, created_at, updated_at FROM todos WHERE id = ? AND user_id = ?").bind(todoId, user.id).first<TodoRecord>()
    return json({ data: serialize(created!) }, 201)
  }
  if (request.method === "PATCH" && id) {
    canWrite(user)
    const fields = parseFields(await readBody(request), true)
    if (!await env.DB.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Task not found.")
    const assignments: string[] = []; const values: unknown[] = []
    const columns = { title: "title", description: "description", priority: "priority", dueAt: "due_at" } as const
    for (const [key, column] of Object.entries(columns) as Array<[keyof typeof columns, string]>) if (key in fields) { assignments.push(`${column} = ?`); values.push(fields[key]) }
    if ("completed" in fields) assignments.push(`completed_at = ${fields.completed ? "unixepoch()" : "NULL"}`)
    assignments.push("updated_at = unixepoch()")
    await env.DB.prepare(`UPDATE todos SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values, id, user.id).run()
    const updated = await env.DB.prepare("SELECT id, title, description, priority, due_at, completed_at, created_at, updated_at FROM todos WHERE id = ? AND user_id = ?").bind(id, user.id).first<TodoRecord>()
    return json({ data: serialize(updated!) })
  }
  if (request.method === "DELETE" && id) {
    canWrite(user)
    if (!await env.DB.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Task not found.")
    await env.DB.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").bind(id, user.id).run()
    return new Response(null, { status: 204 })
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
}
