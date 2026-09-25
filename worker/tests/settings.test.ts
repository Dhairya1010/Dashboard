import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleSettings } from "../src/settings"

let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON")
  for (const migration of ["0001_core.sql", "0002_local_auth_roles.sql", "0003_reminder_recurrence.sql", "0004_settings_preferences.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email, role) VALUES ('owner', 'owner-sub', 'owner@example.com', 'owner'), ('viewer', 'viewer-sub', 'viewer@example.com', 'viewer'); INSERT INTO settings (user_id) VALUES ('owner'), ('viewer')")
  const prepare = (sql: string) => { let values: unknown[] = []; const statement = { bind: (...bindings: unknown[]) => { values = bindings; return statement }, first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values), success: true, meta: {} }), run: async () => { sqlite.prepare(sql).run(...values); return { results: [], success: true, meta: {} } } }; return statement }
  DB = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())
const request = (method = "GET", body?: unknown) => new Request("https://dashboard.example.com/api/settings", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })

describe("settings route", () => {
  it("reads defaults and persists validated preferences", async () => {
    const initial = await handleSettings(request(), { DB }, { id: "owner", role: "owner" }, "/api/settings")
    expect((await initial!.json()).data).toMatchObject({ timezone: "Australia/Brisbane", weekStartsOn: 1, defaultTaskPriority: "medium" })
    const updated = await handleSettings(request("PATCH", { timezone: "Pacific/Auckland", weekStartsOn: 0, defaultTaskPriority: "high" }), { DB }, { id: "owner", role: "owner" }, "/api/settings")
    expect((await updated!.json()).data).toMatchObject({ timezone: "Pacific/Auckland", weekStartsOn: 0, defaultTaskPriority: "high" })
  })
  it("rejects invalid values and viewer changes", async () => {
    await expect(handleSettings(request("PATCH", { timezone: "Mars/Olympus" }), { DB }, { id: "owner", role: "owner" }, "/api/settings")).rejects.toMatchObject({ status: 400 })
    await expect(handleSettings(request("PATCH", { weekStartsOn: 0 }), { DB }, { id: "viewer", role: "viewer" }, "/api/settings")).rejects.toMatchObject({ status: 403 })
  })
})
