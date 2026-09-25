import { useEffect, useMemo, useState } from "react"
import { AlarmClock, AlertTriangle, CalendarDays, CheckSquare2, ChevronRight, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiError } from "@/lib/api"
import { getSchedule, type ScheduleEvent } from "@/lib/schedule-api"

export function OverviewPage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController(), now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - 1, 1), end = new Date(now.getFullYear(), now.getMonth() + 2, 1)
    getSchedule(Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000), controller.signal).then(setEvents).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : "Your overview could not be loaded.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const data = useMemo(() => {
    const now = Date.now() / 1000, start = new Date(), end = new Date(); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
    const todayTasks = events.filter((event) => event.type === "task" && event.status === "pending" && event.startsAt >= start.getTime() / 1000 && event.startsAt <= end.getTime() / 1000)
    const upcoming = events.filter((event) => event.type === "reminder" && event.status === "pending" && event.startsAt >= now).slice(0, 5)
    const overdue = events.filter((event) => event.status === "pending" && event.startsAt < now).length
    return { todayTasks, upcoming, overdue }
  }, [events])
  if (loading) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading overview" /></div>
  return <div className="grid min-w-0 gap-5 lg:grid-cols-3">
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 lg:col-span-3">{error}</p>}
    <Card className="min-w-0 lg:col-span-2"><CardHeader><div><CardTitle>Today</CardTitle><p className="mt-1 text-sm text-muted-foreground">{data.todayTasks.length ? `${data.todayTasks.length} open task${data.todayTasks.length === 1 ? "" : "s"} due today.` : "No open tasks due today."}</p></div><Button asChild variant="ghost" size="icon"><a href="#tasks" aria-label="View tasks"><ChevronRight className="size-4" /></a></Button></CardHeader><CardContent>{data.todayTasks.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-5 text-center"><CheckSquare2 className="mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">Your day is clear</p><p className="mt-2 text-sm text-muted-foreground">Add a due date to a task to see it here.</p><Button asChild variant="outline" className="mt-4"><a href="#tasks">Open tasks</a></Button></div> : <div className="divide-y">{data.todayTasks.map((event) => <a key={event.id} href="#tasks" className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><CheckSquare2 className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${event.priority === "high" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{event.priority}</span></a>)}</div>}</CardContent></Card>
    <Card className="min-w-0"><CardHeader><CardTitle>Upcoming</CardTitle><Button asChild variant="ghost" size="icon"><a href="#schedule" aria-label="View schedule"><ChevronRight className="size-4" /></a></Button></CardHeader><CardContent>{data.upcoming.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center text-center"><CalendarDays className="mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">Nothing coming up</p><p className="mt-2 text-sm text-muted-foreground">Your next reminders will appear here.</p></div> : <div className="space-y-4">{data.upcoming.map((event) => <a key={event.id} href="#reminders" className="flex gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700"><AlarmClock className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{new Date(event.startsAt * 1000).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</p></div></a>)}</div>}</CardContent></Card>
    <Card className="min-w-0 lg:col-span-3"><CardContent className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"><div className={`grid size-11 place-items-center rounded-xl ${data.overdue ? "bg-red-100 text-red-700" : "bg-accent text-primary"}`}>{data.overdue ? <AlertTriangle className="size-5" /> : <CheckSquare2 className="size-5" />}</div><div><p className="font-medium">{data.overdue ? `${data.overdue} overdue item${data.overdue === 1 ? "" : "s"}` : "Everything is on track"}</p><p className="mt-1 text-sm text-muted-foreground">{data.overdue ? "Review past-due tasks and reminders when you have a moment." : "You have no overdue tasks or reminders."}</p></div><Button asChild variant="outline"><a href="#schedule">View schedule<ChevronRight className="size-4" /></a></Button></CardContent></Card>
  </div>
}
