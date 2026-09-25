import { ApiError } from "./api"

export interface Note { id: string; title: string; content: string; category: string; createdAt: number; updatedAt: number }
export type NoteInput = Pick<Note, "title" | "content" | "category">

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers } })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed.")
  return body.data as T
}

export const getNotes = (signal?: AbortSignal) => request<Note[]>("/api/notes", { signal })
export const createNote = (input: NoteInput) => request<Note>("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const updateNote = (id: string, input: Partial<NoteInput>) => request<Note>(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
export const deleteNote = (id: string) => request<void>(`/api/notes/${id}`, { method: "DELETE" })
