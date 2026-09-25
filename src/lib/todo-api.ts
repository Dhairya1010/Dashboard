import { ApiError } from "./api"

export interface Todo {
  id: string
  title: string
  description: string
  priority: "low" | "medium" | "high"
  dueAt: number | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

export type TodoInput = Pick<Todo, "title" | "description" | "priority" | "dueAt">

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers } })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed.")
  return body.data as T
}

export const getTodos = (signal?: AbortSignal) => request<Todo[]>("/api/todos", { signal })
export const createTodo = (input: TodoInput) => request<Todo>("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const updateTodo = (id: string, input: Partial<TodoInput> & { completed?: boolean }) => request<Todo>(`/api/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const deleteTodo = (id: string) => request<void>(`/api/todos/${id}`, { method: "DELETE" })
