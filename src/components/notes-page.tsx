import { useEffect, useMemo, useState, type FormEvent } from "react"
import { FileText, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import { createNote, deleteNote, getNotes, updateNote, type Note, type NoteInput } from "@/lib/note-api"

const empty: NoteInput = { title: "", content: "", category: "" }
const fieldClass = "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function NotesPage({ readOnly }: { readOnly: boolean }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<NoteInput>(empty)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    getNotes(controller.signal).then(setNotes).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : "Notes could not be loaded.")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const categories = useMemo(() => [...new Set(notes.map((note) => note.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [notes])
  const visible = useMemo(() => notes.filter((note) => {
    const query = search.trim().toLowerCase()
    return (category === "all" || note.category === category) && (!query || note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query) || note.category.toLowerCase().includes(query))
  }), [notes, search, category])

  function openNew() { setEditingId(null); setDraft(empty); setShowForm(true); setError("") }
  function openEdit(note: Note) { setEditingId(note.id); setDraft({ title: note.title, content: note.content, category: note.category }); setShowForm(true); setError("") }
  function closeForm() { setShowForm(false); setEditingId(null); setDraft(empty) }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("")
    try {
      if (editingId) {
        const updated = await updateNote(editingId, draft)
        setNotes((items) => items.map((note) => note.id === editingId ? updated : note).sort((a, b) => b.updatedAt - a.updatedAt))
      } else {
        const created = await createNote(draft); setNotes((items) => [created, ...items])
      }
      closeForm()
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "The note could not be saved.") }
    finally { setSaving(false) }
  }

  async function remove(note: Note) {
    if (!window.confirm(`Delete “${note.title}”?`)) return
    setError("")
    try { await deleteNote(note.id); setNotes((items) => items.filter((item) => item.id !== note.id)) }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "The note could not be deleted.") }
  }

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><input aria-label="Search notes" placeholder="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} className={`${fieldClass} pl-9`} /></div>
      <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className={`${fieldClass} lg:w-52`}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      {!readOnly && <Button onClick={openNew}><Plus className="size-4" />New note</Button>}
    </div>
    {readOnly && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">This account can view notes but cannot change them.</p>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {showForm && <Card><CardContent className="pt-6"><form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]"><div><label htmlFor="note-title" className="mb-2 block text-sm font-medium">Title</label><input id="note-title" required maxLength={200} autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={fieldClass} /></div><div><label htmlFor="note-category" className="mb-2 block text-sm font-medium">Category <span className="text-muted-foreground">(optional)</span></label><input id="note-category" list="note-categories" maxLength={100} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className={fieldClass} /><datalist id="note-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist></div></div>
      <div><label htmlFor="note-content" className="mb-2 block text-sm font-medium">Note</label><textarea id="note-content" maxLength={100000} rows={9} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className="w-full resize-y rounded-md border bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeForm}><X className="size-4" />Cancel</Button><Button type="submit" disabled={saving || !draft.title.trim()}>{saving && <LoaderCircle className="size-4 animate-spin" />}{saving ? "Saving…" : editingId ? "Save changes" : "Add note"}</Button></div>
    </form></CardContent></Card>}
    {loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading notes" /></div> : visible.length === 0 ? <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><FileText className="mb-4 size-6 text-muted-foreground" /><p className="font-medium">{search || category !== "all" ? "No matching notes" : "No notes yet"}</p><p className="mt-2 text-sm text-muted-foreground">{search || category !== "all" ? "Try changing your search or category." : "Capture an idea whenever inspiration arrives."}</p></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((note) => <Card key={note.id} className="min-w-0"><CardContent className="flex h-full min-h-52 flex-col p-5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{note.title}</h2>{note.category && <span className="mt-2 inline-block rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">{note.category}</span>}</div>{!readOnly && <div className="flex"><Button variant="ghost" size="icon" onClick={() => openEdit(note)} aria-label={`Edit ${note.title}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(note)} aria-label={`Delete ${note.title}`}><Trash2 className="size-4" /></Button></div>}</div><p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{note.content || "No additional details."}</p><p className="mt-auto pt-5 text-xs text-muted-foreground">Updated {new Date(note.updatedAt * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p></CardContent></Card>)}</div>}
  </div>
}
