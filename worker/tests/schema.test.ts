import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it } from "vitest"

let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(readFileSync(new URL("../migrations/0001_core.sql", import.meta.url), "utf8"))
  db.exec(readFileSync(new URL("../migrations/0002_local_auth_roles.sql", import.meta.url), "utf8"))
  db.prepare("INSERT INTO users (id, access_subject, email) VALUES (?, ?, ?)").run("owner", "subject", "owner@example.com")
})
afterEach(() => db.close())

it("enforces task ownership and priority constraints", () => {
  const insert = db.prepare("INSERT INTO todos (id, user_id, title, priority) VALUES (?, ?, ?, ?)")
  expect(() => insert.run("task", "unknown", "Example", "medium")).toThrow()
  expect(() => insert.run("task", "owner", "Example", "invalid")).toThrow()
  expect(() => insert.run("task", "owner", "  ", "medium")).toThrow()
  insert.run("task", "owner", "Example", "high")
  expect(db.prepare("SELECT count(*) AS count FROM todos").get()?.count).toBe(1)
})

it("uses UTC timestamps and cascades deletion of owned records", () => {
  db.exec("INSERT INTO notes (id, user_id, title) VALUES ('note', 'owner', 'Example')")
  const note = db.prepare("SELECT created_at FROM notes").get()
  expect(Number(note?.created_at)).toBeGreaterThan(Math.floor(Date.now() / 1000) - 10)
  db.exec("DELETE FROM users WHERE id = 'owner'")
  expect(db.prepare("SELECT count(*) AS count FROM notes").get()?.count).toBe(0)
})

it("indexes pending reminders by due time", () => {
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM reminders WHERE status = 'pending' AND due_at <= ?").all(1000)
  expect(JSON.stringify(plan)).toContain("reminders_pending_due")
})

it("restricts users to supported roles", () => {
  expect(() => db.exec("UPDATE users SET role = 'superuser' WHERE id = 'owner'")).toThrow()
  db.exec("UPDATE users SET role = 'viewer' WHERE id = 'owner'")
  expect(db.prepare("SELECT role FROM users WHERE id = 'owner'").get()?.role).toBe("viewer")
})
