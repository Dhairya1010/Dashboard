import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { handleSchedule } from "../src/schedule"

let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON")
  for (const migration of ["0001_core.sql", "0002_local_auth_roles.sql", "0003_reminder_recurrence.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email) VALUES ('owner', 'owner-sub', 'owner@example.com'), ('other', 'other-sub', 'other@example.com')")
  sqlite.exec("INSERT INTO todos (id, user_id, title, due_at, priority) VALUES ('task-1', 'owner', 'Due task', 2000, 'high'), ('task-2', 'other', 'Private task', 2000, 'low')")
  sqlite.exec("INSERT INTO reminders (id, user_id, title, due_at, recurrence) VALUES ('reminder-1', 'owner', 'Appointment', 3000, 'monthly'), ('reminder-2', 'other', 'Private reminder', 3000, 'none')")
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
  DB = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())

describe("schedule route", () => {
  it("combines owned tasks and reminders in chronological order", async () => {
    const response = await handleSchedule(new Request("https://dashboard.example.com/api/schedule?start=1000&end=4000"), { DB }, "owner", "/api/schedule")
    expect(response).not.toBeNull()
    expect((await response!.json()).data).toEqual([
      expect.objectContaining({ id: "task-1", type: "task", startsAt: 2000, priority: "high" }),
      expect.objectContaining({ id: "reminder-1", type: "reminder", startsAt: 3000, recurrence: "monthly" }),
    ])
  })
  it("rejects invalid and excessive ranges", async () => {
    await expect(handleSchedule(new Request("https://dashboard.example.com/api/schedule?start=4000&end=1000"), { DB }, "owner", "/api/schedule")).rejects.toMatchObject({ status: 400 })
    await expect(handleSchedule(new Request("https://dashboard.example.com/api/schedule?start=0&end=40000000"), { DB }, "owner", "/api/schedule")).rejects.toMatchObject({ status: 400 })
  })
})
