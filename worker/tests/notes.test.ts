import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { handleNotes } from "../src/notes"

let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec(readFileSync(new URL("../migrations/0001_core.sql", import.meta.url), "utf8")); sqlite.exec(readFileSync(new URL("../migrations/0002_local_auth_roles.sql", import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email, role) VALUES ('owner', 'owner-sub', 'owner@example.com', 'owner'), ('other', 'other-sub', 'other@example.com', 'member'), ('viewer', 'viewer-sub', 'viewer@example.com', 'viewer')")
  const prepare = (sql: string) => { let values: unknown[] = []; const statement = { bind: (...bindings: unknown[]) => { values = bindings; return statement }, first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values), success: true, meta: {} }), run: async () => { sqlite.prepare(sql).run(...values); return { results: [], success: true, meta: {} } } }; return statement }
  DB = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())

const owner = { id: "owner", role: "owner" }
const request = (path: string, method = "GET", body?: unknown) => new Request(`https://dashboard.example.com${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })

describe("note routes", () => {
  it("creates, lists, edits, and deletes a note", async () => {
    const createdResponse = await handleNotes(request("/api/notes", "POST", { title: " Idea ", content: "First draft", category: "Work" }), { DB }, owner, "/api/notes")
    expect(createdResponse).not.toBeNull(); expect(createdResponse!.status).toBe(201)
    const created = (await createdResponse!.json()).data
    expect(created).toMatchObject({ title: "Idea", content: "First draft", category: "Work" })
    const listed = await handleNotes(request("/api/notes"), { DB }, owner, "/api/notes")
    expect((await listed!.json()).data).toHaveLength(1)
    const updated = await handleNotes(request(`/api/notes/${created.id}`, "PATCH", { title: "Better idea", category: "Personal" }), { DB }, owner, `/api/notes/${created.id}`)
    expect((await updated!.json()).data).toMatchObject({ title: "Better idea", content: "First draft", category: "Personal" })
    expect((await handleNotes(request(`/api/notes/${created.id}`, "DELETE"), { DB }, owner, `/api/notes/${created.id}`))!.status).toBe(204)
  })

  it("validates, isolates ownership, and enforces viewer access", async () => {
    await expect(handleNotes(request("/api/notes", "POST", { title: " ", content: "x" }), { DB }, owner, "/api/notes")).rejects.toMatchObject({ status: 400 })
    const privateId = "22222222-2222-4222-8222-222222222222"
    sqlite.prepare("INSERT INTO notes (id, user_id, title) VALUES (?, 'other', 'Private')").run(privateId)
    await expect(handleNotes(request(`/api/notes/${privateId}`, "PATCH", { title: "Changed" }), { DB }, owner, `/api/notes/${privateId}`)).rejects.toMatchObject({ status: 404 })
    await expect(handleNotes(request("/api/notes", "POST", { title: "Nope" }), { DB }, { id: "viewer", role: "viewer" }, "/api/notes")).rejects.toMatchObject({ status: 403 })
  })
})
