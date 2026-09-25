import { HttpError, json } from "./http"

export interface NoteUser { id: string; role: string }
interface NoteRecord { id: string; title: string; content: string; category: string; created_at: number; updated_at: number }

function canWrite(user: NoteUser) {
  if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.")
}

async function readBody(request: Request) {
  if ((Number(request.headers.get("Content-Length")) || 0) > 131_072) throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.")
  try { return await request.json() as Record<string, unknown> }
  catch { throw new HttpError(400, "INVALID_INPUT", "Enter valid note details.") }
}

function fields(input: Record<string, unknown>, partial = false) {
  const output: { title?: string; content?: string; category?: string } = {}
  if (!partial || "title" in input) {
    if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 200) throw new HttpError(400, "INVALID_INPUT", "Note titles must be between 1 and 200 characters.")
    output.title = input.title.trim()
  }
  if (!partial || "content" in input) {
    if (input.content !== undefined && (typeof input.content !== "string" || input.content.length > 100_000)) throw new HttpError(400, "INVALID_INPUT", "Notes must be 100,000 characters or fewer.")
    output.content = typeof input.content === "string" ? input.content : ""
  }
  if (!partial || "category" in input) {
    if (input.category !== undefined && (typeof input.category !== "string" || input.category.trim().length > 100)) throw new HttpError(400, "INVALID_INPUT", "Categories must be 100 characters or fewer.")
    output.category = typeof input.category === "string" ? input.category.trim() : ""
  }
  if (partial && Object.keys(output).length === 0) throw new HttpError(400, "INVALID_INPUT", "No note changes were provided.")
  return output
}

function serialize(note: NoteRecord) {
  return { id: note.id, title: note.title, content: note.content, category: note.category, createdAt: note.created_at, updatedAt: note.updated_at }
}

export async function handleNotes(request: Request, env: { DB: D1Database }, user: NoteUser, pathname: string) {
  const match = pathname.match(/^\/api\/notes(?:\/([0-9a-f-]+))?$/i)
  if (!match) return null
  const id = match[1]
  if (request.method === "GET" && !id) {
    const rows = await env.DB.prepare("SELECT id, title, content, category, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC").bind(user.id).all<NoteRecord>()
    return json({ data: rows.results.map(serialize) })
  }
  if (request.method === "POST" && !id) {
    canWrite(user)
    const input = fields(await readBody(request)); const noteId = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO notes (id, user_id, title, content, category) VALUES (?, ?, ?, ?, ?)").bind(noteId, user.id, input.title, input.content, input.category).run()
    const created = await env.DB.prepare("SELECT id, title, content, category, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?").bind(noteId, user.id).first<NoteRecord>()
    return json({ data: serialize(created!) }, 201)
  }
  if (request.method === "PATCH" && id) {
    canWrite(user)
    const input = fields(await readBody(request), true)
    if (!await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Note not found.")
    const assignments: string[] = []; const values: unknown[] = []
    for (const key of ["title", "content", "category"] as const) if (key in input) { assignments.push(`${key} = ?`); values.push(input[key]) }
    assignments.push("updated_at = unixepoch()")
    await env.DB.prepare(`UPDATE notes SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values, id, user.id).run()
    const updated = await env.DB.prepare("SELECT id, title, content, category, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).first<NoteRecord>()
    return json({ data: serialize(updated!) })
  }
  if (request.method === "DELETE" && id) {
    canWrite(user)
    if (!await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).first()) throw new HttpError(404, "NOT_FOUND", "Note not found.")
    await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).run()
    return new Response(null, { status: 204 })
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
}
