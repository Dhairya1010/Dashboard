import { useEffect, useState } from "react"
import { Bell, CheckCheck, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import { getNotifications, markAllNotificationsRead, markNotificationRead, type DashboardNotification } from "@/lib/notification-api"

export function NotificationsPage() {
  const [items, setItems] = useState<DashboardNotification[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("")
  useEffect(() => { const controller = new AbortController(); getNotifications(controller.signal).then(setItems).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : "Notifications could not be loaded.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [])
  async function read(item: DashboardNotification) { if (item.readAt) return; try { await markNotificationRead(item.id); setItems((current) => current.map((value) => value.id === item.id ? { ...value, readAt: Math.floor(Date.now() / 1000) } : value)) } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Notification could not be updated.") } }
  async function readAll() { try { await markAllNotificationsRead(); const now = Math.floor(Date.now() / 1000); setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now }))) } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Notifications could not be updated.") } }
  const unread = items.filter((item) => !item.readAt).length
  if (loading) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading notifications" /></div>
  return <div className="space-y-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{unread} unread notification{unread === 1 ? "" : "s"}</p>{unread > 0 && <Button variant="outline" onClick={readAll}><CheckCheck className="size-4" />Mark all read</Button>}</div>{error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{items.length === 0 ? <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><Bell className="mb-4 size-6 text-muted-foreground" /><p className="font-medium">No notifications yet</p><p className="mt-2 text-sm text-muted-foreground">Due reminders will appear here.</p></CardContent></Card> : <div className="space-y-3">{items.map((item) => <button key={item.id} onClick={() => read(item)} className={`flex w-full gap-4 rounded-xl border p-4 text-left ${item.readAt ? "bg-card" : "border-primary/30 bg-accent/40"}`}><span className={`mt-1 size-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} /><div><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">Reminder due {new Date(item.occurrenceAt * 1000).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</p></div></button>)}</div>}</div>
}
