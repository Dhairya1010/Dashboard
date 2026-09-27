import { useEffect, useMemo, useState, type FormEvent } from "react"
import { AlarmClock, Check, Circle, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import { createReminder, type Reminder, type ReminderInput } from "@/lib/reminder-api"
import { createTodo, deleteTodo, getTodos, updateTodo, type Todo, type TodoInput } from "@/lib/todo-api"
import { getSettings } from "@/lib/settings-api"

type Filter = "open" | "completed" | "all"
const fieldClass = "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

function localDueDate(seconds: number | null) {
  if (!seconds) return ""
  const date = new Date(seconds * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function dueTimestamp(value: string) {
  if (!value) return null
  const date = new Date(`${value}T23:59:59`)
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000)
}

function reminderInputDate(seconds: number) {
  if (!Number.isFinite(seconds)) return ""
  const date = new Date(seconds * 1000)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function TasksPage({ readOnly }: { readOnly: boolean }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reminderSaving, setReminderSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reminderTask, setReminderTask] = useState<Todo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<Filter>("open")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [defaultPriority, setDefaultPriority] = useState<Todo["priority"]>("medium")
  const [preferredTimezone, setPreferredTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Brisbane")
  const [draft, setDraft] = useState<TodoInput>({ title: "", description: "", priority: "medium", dueAt: null })
  const [reminderDraft, setReminderDraft] = useState<ReminderInput>({ title: "", dueAt: Math.floor(Date.now() / 1000) + 3600, timezone: preferredTimezone, recurrence: "none" })

  useEffect(() => { const controller = new AbortController(); getSettings(controller.signal).then((value) => { setDefaultPriority(value.defaultTaskPriority); setPreferredTimezone(value.timezone); setDraft((current) => ({ ...current, priority: value.defaultTaskPriority })); setReminderDraft((current) => ({ ...current, timezone: value.timezone })) }).catch(() => {}); return () => controller.abort() }, [])

  useEffect(() => {
    const controller = new AbortController()
    getTodos(controller.signal).then(setTodos).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : "Tasks could not be loaded.")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const visible = useMemo(() => todos.filter((todo) => {
    if (filter === "open" && todo.completedAt) return false
    if (filter === "completed" && !todo.completedAt) return false
    const query = search.trim().toLowerCase()
    return !query || todo.title.toLowerCase().includes(query) || todo.description.toLowerCase().includes(query)
  }), [todos, filter, search])

  function openNew() {
    setReminderTask(null)
    setEditingId(null)
    setDraft({ title: "", description: "", priority: defaultPriority, dueAt: null })
    setShowForm(true)
    setError("")
  }

  function openEdit(todo: Todo) {
    setReminderTask(null)
    setEditingId(todo.id)
    setDraft({ title: todo.title, description: todo.description, priority: todo.priority, dueAt: todo.dueAt })
    setShowForm(true)
    setError("")
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setDraft({ title: "", description: "", priority: defaultPriority, dueAt: null })
  }

  function openReminder(todo: Todo) {
    const now = Math.floor(Date.now() / 1000)
    setShowForm(false)
    setEditingId(null)
    setReminderTask(todo)
    setReminderDraft({ title: todo.title, dueAt: todo.dueAt && todo.dueAt > now ? todo.dueAt : now + 3600, timezone: preferredTimezone, recurrence: "none" })
    setError("")
    setNotice("")
  }

  function closeReminder() {
    setReminderTask(null)
  }

  async function addReminder(event: FormEvent) {
    event.preventDefault(); setReminderSaving(true); setError(""); setNotice("")
    try {
      await createReminder(reminderDraft)
      setNotice(`Reminder added for “${reminderTask?.title ?? reminderDraft.title}”.`)
      closeReminder()
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "The reminder could not be saved.") }
    finally { setReminderSaving(false) }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("")
    try {
      if (editingId) {
        const updated = await updateTodo(editingId, draft)
        setTodos((items) => items.map((todo) => todo.id === editingId ? updated : todo))
      } else {
        const created = await createTodo(draft)
        setTodos((current) => [created, ...current])
      }
      closeForm()
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "The task could not be saved.") }
    finally { setSaving(false) }
  }

  async function toggle(todo: Todo) {
    setError("")
    try { const updated = await updateTodo(todo.id, { completed: !todo.completedAt }); setTodos((items) => items.map((item) => item.id === todo.id ? updated : item)) }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "The task could not be updated.") }
  }

  async function remove(todo: Todo) {
    if (!window.confirm(`Delete “${todo.title}”?`)) return
    setError("")
    try { await deleteTodo(todo.id); setTodos((items) => items.filter((item) => item.id !== todo.id)) }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "The task could not be deleted.") }
  }

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} className={`${fieldClass} pl-9`} /></div>
      {!readOnly && <Button onClick={openNew}><Plus className="size-4" />New task</Button>}
    </div>
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Filter tasks">{(["open", "completed", "all"] as Filter[]).map((value) => <Button key={value} variant={filter === value ? "default" : "ghost"} size="sm" onClick={() => setFilter(value)} className="flex-1 capitalize sm:flex-none">{value}</Button>)}</div>
    {readOnly && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">This account can view tasks but cannot change them.</p>}
    {notice && <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {showForm && <Card><CardContent className="pt-6"><form onSubmit={save} className="grid gap-4">
      <div><label htmlFor="task-title" className="mb-2 block text-sm font-medium">Title</label><input id="task-title" required maxLength={200} autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={fieldClass} /></div>
      <div><label htmlFor="task-description" className="mb-2 block text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span></label><textarea id="task-description" maxLength={10000} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="task-priority" className="mb-2 block text-sm font-medium">Priority</label><select id="task-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Todo["priority"] })} className={fieldClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><div><label htmlFor="task-due" className="mb-2 block text-sm font-medium">Due date</label><input id="task-due" type="date" value={localDueDate(draft.dueAt)} onChange={(event) => setDraft({ ...draft, dueAt: dueTimestamp(event.target.value) })} className={fieldClass} /></div></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeForm}><X className="size-4" />Cancel</Button><Button type="submit" disabled={saving || !draft.title.trim()}>{saving && <LoaderCircle className="size-4 animate-spin" />}{saving ? "Saving…" : editingId ? "Save changes" : "Add task"}</Button></div>
    </form></CardContent></Card>}
    {reminderTask && <Card><CardContent className="pt-6"><form onSubmit={addReminder} className="grid gap-4">
      <div><p className="text-sm font-medium">Add reminder for task</p><p className="mt-1 text-sm text-muted-foreground">{reminderTask.title}</p></div>
      <div><label htmlFor="task-reminder-title" className="mb-2 block text-sm font-medium">Reminder title</label><input id="task-reminder-title" required maxLength={200} autoFocus value={reminderDraft.title} onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })} className={fieldClass} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="task-reminder-due" className="mb-2 block text-sm font-medium">Date and time</label><input id="task-reminder-due" type="datetime-local" required value={reminderInputDate(reminderDraft.dueAt)} onChange={(event) => setReminderDraft({ ...reminderDraft, dueAt: Math.floor(new Date(event.target.value).getTime() / 1000) })} className={fieldClass} /></div><div><label htmlFor="task-reminder-recurrence" className="mb-2 block text-sm font-medium">Repeat</label><select id="task-reminder-recurrence" value={reminderDraft.recurrence} onChange={(event) => setReminderDraft({ ...reminderDraft, recurrence: event.target.value as Reminder["recurrence"] })} className={fieldClass}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div></div>
      <p className="text-xs text-muted-foreground">Timezone: {reminderDraft.timezone}</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeReminder}><X className="size-4" />Cancel</Button><Button type="submit" disabled={reminderSaving || !reminderDraft.title.trim()}>{reminderSaving && <LoaderCircle className="size-4 animate-spin" />}{reminderSaving ? "Saving…" : "Add reminder"}</Button></div>
    </form></CardContent></Card>}
    {loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading tasks" /></div> : visible.length === 0 ? <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><Check className="mb-4 size-6 text-muted-foreground" /><p className="font-medium">{search ? "No matching tasks" : filter === "completed" ? "Nothing completed yet" : "You’re all clear"}</p><p className="mt-2 text-sm text-muted-foreground">{search ? "Try a different search." : "Add a task when something needs your attention."}</p></CardContent></Card> : <div className="space-y-3">{visible.map((todo) => {
      const overdue = !todo.completedAt && todo.dueAt !== null && todo.dueAt < Date.now() / 1000
      return <Card key={todo.id}><CardContent className="flex gap-3 p-4 sm:p-5"><button disabled={readOnly} onClick={() => toggle(todo)} aria-label={todo.completedAt ? `Mark ${todo.title} incomplete` : `Complete ${todo.title}`} className="mt-0.5 shrink-0 text-primary disabled:opacity-50">{todo.completedAt ? <Check className="size-5 rounded-full bg-primary p-0.5 text-primary-foreground" /> : <Circle className="size-5" />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`font-medium ${todo.completedAt ? "text-muted-foreground line-through" : ""}`}>{todo.title}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${todo.priority === "high" ? "bg-red-100 text-red-700" : todo.priority === "low" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}>{todo.priority}</span></div>{todo.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{todo.description}</p>}{todo.dueAt && <p className={`mt-2 text-xs ${overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>{overdue ? "Overdue · " : "Due "}{new Date(todo.dueAt * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>}</div>{!readOnly && <div className="flex shrink-0"><Button variant="ghost" size="icon" onClick={() => openReminder(todo)} aria-label={`Add reminder for ${todo.title}`}><AlarmClock className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => openEdit(todo)} aria-label={`Edit ${todo.title}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(todo)} aria-label={`Delete ${todo.title}`}><Trash2 className="size-4" /></Button></div>}</CardContent></Card>
    })}</div>}
  </div>
}
