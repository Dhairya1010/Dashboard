import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleReminders } from "../src/reminders"

let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON")
  for (const migration of ["0001_core.sql", "0002_local_auth_roles.sql", "0003_reminder_recurrence.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email, role) VALUES ('owner', 'owner-sub', 'owner@example.com', 'owner'), ('other', 'other-sub', 'other@example.com', 'member'), ('viewer', 'viewer-sub', 'viewer@example.com', 'viewer')")
  const prepare = (sql: string) => { let values: unknown[] = []; const statement = { bind: (...bindings: unknown[]) => { values = bindings; return statement }, first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values), success: true, meta: {} }), run: async () => { sqlite.prepare(sql).run(...values); return { results: [], success: true, meta: {} } } }; return statement }
  DB = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())
const owner = { id: "owner", role: "owner" }
const request = (path: string, method = "GET", body?: unknown) => new Request(`https://dashboard.example.com${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })

describe("reminder routes", () => {
  it("creates, edits, cancels, and deletes a recurring reminder", async () => {
    const response = await handleReminders(request("/api/reminders", "POST", { title: "Weekly review", dueAt: 2_000_000_000, timezone: "Australia/Brisbane", recurrence: "weekly" }), { DB }, owner, "/api/reminders")
    expect(response!.status).toBe(201); const created = (await response!.json()).data
    expect(created).toMatchObject({ title: "Weekly review", recurrence: "weekly", status: "pending" })
    const updated = await handleReminders(request(`/api/reminders/${created.id}`, "PATCH", { status: "cancelled", recurrence: "monthly" }), { DB }, owner, `/api/reminders/${created.id}`)
    expect((await updated!.json()).data).toMatchObject({ recurrence: "monthly", status: "cancelled" })
    expect((await handleReminders(request(`/api/reminders/${created.id}`, "DELETE"), { DB }, owner, `/api/reminders/${created.id}`))!.status).toBe(204)
  })
  it("validates timezone and recurrence, isolates owners, and blocks viewers", async () => {
    await expect(handleReminders(request("/api/reminders", "POST", { title: "Bad", dueAt: 2_000_000_000, timezone: "Mars/Olympus", recurrence: "yearly" }), { DB }, owner, "/api/reminders")).rejects.toMatchObject({ status: 400 })
    const privateId = "33333333-3333-4333-8333-333333333333"; sqlite.prepare("INSERT INTO reminders (id, user_id, title, due_at) VALUES (?, 'other', 'Private', 2000000000)").run(privateId)
    await expect(handleReminders(request(`/api/reminders/${privateId}`, "PATCH", { status: "cancelled" }), { DB }, owner, `/api/reminders/${privateId}`)).rejects.toMatchObject({ status: 404 })
    await expect(handleReminders(request("/api/reminders", "POST", { title: "No", dueAt: 2_000_000_000, timezone: "UTC", recurrence: "none" }), { DB }, { id: "viewer", role: "viewer" }, "/api/reminders")).rejects.toMatchObject({ status: 403 })
  })
})
