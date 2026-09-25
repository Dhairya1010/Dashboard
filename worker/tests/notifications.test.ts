import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleNotifications, processDueReminders } from "../src/notifications"
import type { Env } from "../src/env"

let sqlite: DatabaseSync
let env: Env
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON")
  for (const migration of ["0001_core.sql", "0002_local_auth_roles.sql", "0003_reminder_recurrence.sql", "0004_settings_preferences.sql", "0005_web_push.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email, role) VALUES ('owner', 'owner-sub', 'owner@example.com', 'owner'); INSERT INTO settings (user_id) VALUES ('owner')")
  const prepare = (sql: string) => {
    let values: unknown[] = []
    const statement = {
      bind: (...bindings: unknown[]) => { values = bindings; return statement },
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values), success: true, meta: {} }),
      run: async () => { sqlite.prepare(sql).run(...values); return { results: [], success: true, meta: {} } },
    }
    return statement
  }
  env = { DB: { prepare } as unknown as D1Database } as Env
})
afterEach(() => sqlite.close())

describe("notification processing", () => {
  it("creates one notification, prevents duplicates, and advances recurrence", async () => {
    sqlite.exec("INSERT INTO reminders (id, user_id, title, due_at, recurrence) VALUES ('reminder', 'owner', 'Review', 1000, 'daily')")
    expect((await processDueReminders(env)).processed).toBe(1)
    expect(sqlite.prepare("SELECT count(*) AS count FROM notifications").get()?.count).toBe(1)
    expect(sqlite.prepare("SELECT due_at FROM reminders WHERE id = 'reminder'").get()?.due_at).toBe(87400)
    expect((await processDueReminders(env)).processed).toBe(1)
    expect(sqlite.prepare("SELECT count(*) AS count FROM notifications").get()?.count).toBe(2)
  })

  it("registers and removes an owned browser subscription", async () => {
    const body = { endpoint: "https://push.example.test/device", keys: { p256dh: "key", auth: "auth" } }
    const added = await handleNotifications(new Request("https://dashboard.example.com/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Test browser" }, body: JSON.stringify(body) }), env, { id: "owner", role: "owner" }, "/api/push/subscriptions")
    expect(added?.status).toBe(201)
    const id = sqlite.prepare("SELECT id FROM push_subscriptions").get()?.id as string
    expect(sqlite.prepare("SELECT web_push_enabled FROM settings WHERE user_id = 'owner'").get()?.web_push_enabled).toBe(1)
    expect((await handleNotifications(new Request(`https://dashboard.example.com/api/push/subscriptions/${id}`, { method: "DELETE" }), env, { id: "owner", role: "owner" }, `/api/push/subscriptions/${id}`))?.status).toBe(204)
    expect(sqlite.prepare("SELECT web_push_enabled FROM settings WHERE user_id = 'owner'").get()?.web_push_enabled).toBe(0)
  })
})
