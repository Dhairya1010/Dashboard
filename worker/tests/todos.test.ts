import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { handleTodos } from "../src/todos"

let sqlite: DatabaseSync
let DB: D1Database

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec(readFileSync(new URL("../migrations/0001_core.sql", import.meta.url), "utf8"))
  sqlite.exec(readFileSync(new URL("../migrations/0002_local_auth_roles.sql", import.meta.url), "utf8"))
  sqlite.exec("INSERT INTO users (id, access_subject, email, role) VALUES ('owner', 'owner-sub', 'owner@example.com', 'owner'), ('other', 'other-sub', 'other@example.com', 'member'), ('viewer', 'viewer-sub', 'viewer@example.com', 'viewer')")
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

const request = (path: string, method = "GET", body?: unknown) => new Request(`https://dashboard.example.com${path}`, {
  method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
})
const owner = { id: "owner", role: "owner" }

describe("todo routes", () => {
  it("creates, lists, completes, and deletes an owned task", async () => {
    const createdResponse = await handleTodos(request("/api/todos", "POST", { title: " Ship feature ", description: "Test it", priority: "high", dueAt: 2_000_000_000 }), { DB }, owner, "/api/todos")
    expect(createdResponse?.status).toBe(201)
    expect(createdResponse).not.toBeNull()
    const created = (await createdResponse!.json()).data
    expect(created).toMatchObject({ title: "Ship feature", priority: "high", completedAt: null })

    const listed = await handleTodos(request("/api/todos"), { DB }, owner, "/api/todos")
    expect(listed).not.toBeNull()
    expect((await listed!.json()).data).toHaveLength(1)

    const completed = await handleTodos(request(`/api/todos/${created.id}`, "PATCH", { completed: true }), { DB }, owner, `/api/todos/${created.id}`)
    expect(completed).not.toBeNull()
    expect((await completed!.json()).data.completedAt).toEqual(expect.any(Number))

    expect((await handleTodos(request(`/api/todos/${created.id}`, "DELETE"), { DB }, owner, `/api/todos/${created.id}`))?.status).toBe(204)
    expect(sqlite.prepare("SELECT count(*) AS count FROM todos").get()?.count).toBe(0)
  })

  it("validates input, isolates owners, and blocks viewer mutations", async () => {
    await expect(handleTodos(request("/api/todos", "POST", { title: " ", priority: "urgent" }), { DB }, owner, "/api/todos")).rejects.toMatchObject({ status: 400 })
    const privateId = "11111111-1111-4111-8111-111111111111"
    sqlite.prepare("INSERT INTO todos (id, user_id, title) VALUES (?, 'other', 'Private')").run(privateId)
    await expect(handleTodos(request(`/api/todos/${privateId}`, "PATCH", { completed: true }), { DB }, owner, `/api/todos/${privateId}`)).rejects.toMatchObject({ status: 404 })
    await expect(handleTodos(request("/api/todos", "POST", { title: "Nope" }), { DB }, { id: "viewer", role: "viewer" }, "/api/todos")).rejects.toMatchObject({ status: 403 })
  })
})
