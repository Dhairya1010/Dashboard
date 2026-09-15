import { useEffect, useState } from "react"
import { Bell, CalendarDays, ChartNoAxesCombined, CheckSquare2, ChevronRight, ExternalLink, LayoutDashboard, LogOut, NotebookPen, Settings, Timer } from "lucide-react"

import { AuthGate } from "@/components/auth-gate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { accessLogoutUrl, passwordSignOut, type Session } from "@/lib/api"

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, description: "A little clarity for your day." },
  { id: "tasks", label: "Tasks", icon: CheckSquare2, description: "Make room for what matters, one task at a time." },
  { id: "notes", label: "Notes", icon: NotebookPen, description: "A home for your ideas and everyday thoughts." },
  { id: "reminders", label: "Reminders", icon: Timer, description: "Keep the important things on your radar." },
  { id: "schedule", label: "Schedule", icon: CalendarDays, description: "See what is coming up." },
  { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined, description: "Get a clearer picture of your progress." },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Your updates, together in one place." },
  { id: "settings", label: "Settings", icon: Settings, description: "Make this workspace your own." },
]

function currentPage() {
  return navigation.find((item) => item.id === window.location.hash.slice(1)) ?? navigation[0]
}

function Workspace({ session }: { session: Session }) {
  const [page, setPage] = useState(currentPage)
  const [now, setNow] = useState(() => new Date())
  const { isMobile, setOpenMobile } = useSidebar()
  useEffect(() => {
    const onNavigate = () => { setPage(currentPage()); setOpenMobile(false) }
    window.addEventListener("hashchange", onNavigate)
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => { window.removeEventListener("hashchange", onNavigate); window.clearInterval(timer) }
  }, [setOpenMobile])
  useEffect(() => { document.title = `${page.label} · Dashboard` }, [page.label])
  useEffect(() => { if (!isMobile) setOpenMobile(false) }, [isMobile, setOpenMobile])
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const PageIcon = page.icon
  const initials = session.user.email
    .split("@")[0]
    .split(/[._-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "DP"
  const navItem = (item: typeof navigation[number]) => (
    <SidebarMenuItem key={item.id}>
      <SidebarMenuButton asChild tooltip={item.label} isActive={page.id === item.id} className="h-11">
        <a href={`#${item.id}`} aria-current={page.id === item.id ? "page" : undefined} onClick={() => setOpenMobile(false)}>
          <item.icon aria-hidden="true" /><span>{item.label}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
  return <>
    <a href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus() }} className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only">Skip to content</a>
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-5">
        <a href="#overview" aria-label="Dashboard overview" onClick={() => setOpenMobile(false)} className="flex h-10 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">D</div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold">Dashboard</p><p className="truncate text-xs text-muted-foreground">Personal workspace</p></div>
        </a>
      </SidebarHeader>
      <SidebarContent><nav aria-label="Main navigation"><SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>{navigation.slice(0, 6).map(navItem)}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup></nav></SidebarContent>
      <SidebarFooter>
        <nav aria-label="Account navigation"><SidebarMenu>{navigation.slice(6).map(navItem)}
          <SidebarMenuItem><SidebarMenuButton asChild tooltip="Portfolio" className="h-11"><a href="https://dhairya1010.github.io" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /><span>Portfolio</span></a></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></nav>
        <div className="mt-2 flex items-center gap-3 border-t pt-4 pb-2" title={session.user.email}><div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</div><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium">Dhairya Patel</p><p className="truncate text-xs text-muted-foreground">{session.user.email}</p></div></div>
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild={session.environment === "access"} tooltip="Sign out" className="h-11" onClick={session.environment !== "access" ? async () => { await passwordSignOut(); window.location.reload() } : undefined}>{session.environment !== "access" ? <><LogOut aria-hidden="true" /><span>Sign out</span></> : <a href={accessLogoutUrl}><LogOut aria-hidden="true" /><span>Sign out</span></a>}</SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3"><SidebarTrigger className="size-11 shrink-0" /><span className="h-5 border-l" /><span className="truncate text-sm font-medium">{page.label}</span></div>
        <div className="flex items-center gap-1"><Button asChild variant="ghost" size="icon" className="size-11 shrink-0"><a href="#notifications" aria-label="Notifications"><Bell className="size-4" /></a></Button><span className="grid size-9 place-items-center rounded-full border bg-muted text-xs font-semibold" aria-label={`Signed in as ${session.user.email}`} title={session.user.email}>{initials}</span></div>
      </header>
      <div id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 outline-none sm:px-6 md:px-8 md:py-10">
        <div className="mb-8"><p className="mb-2 text-sm font-medium text-primary">{now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{page.id === "overview" ? `${greeting}, Dhairya.` : page.label}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{page.description}</p>
        </div>
        {page.id === "overview" ? <div className="grid min-w-0 gap-5 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2"><CardHeader><div><CardTitle>Today</CardTitle><p className="mt-1 text-sm text-muted-foreground">A fresh start for your next priority.</p></div></CardHeader><CardContent><div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-5 text-center"><CheckSquare2 className="mb-4 size-6 text-muted-foreground" /><p className="text-sm font-medium">Your day starts here</p><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Task management is coming soon. This will be your space to plan and focus.</p><Button asChild variant="outline" className="mt-5"><a href="#tasks">Explore tasks<ChevronRight className="size-4" /></a></Button></div></CardContent></Card>
          <Card className="min-w-0"><CardHeader><CardTitle>Upcoming</CardTitle><Button asChild variant="ghost" size="icon"><a href="#schedule" aria-label="View schedule"><ChevronRight className="size-4" /></a></Button></CardHeader><CardContent><div className="flex min-h-56 flex-col items-center justify-center px-2 text-center"><CalendarDays className="mb-4 size-6 text-muted-foreground" /><p className="text-sm font-medium">Space for what’s next</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Your upcoming tasks and reminders will appear here.</p></div></CardContent></Card>
          <Card className="min-w-0 lg:col-span-3"><CardHeader><CardTitle>Your workspace</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{navigation.slice(1, 5).map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className="flex min-h-16 items-center gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Icon className="size-5 text-primary" />{label}<ChevronRight className="ml-auto size-4 text-muted-foreground" /></a>)}</div></CardContent></Card>
        </div> : <Card><CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-5 rounded-xl bg-accent p-4"><PageIcon className="size-6 text-primary" /></div><CardTitle>{page.label} is coming soon</CardTitle><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">This space is ready for the next stage of your dashboard.</p><Button asChild variant="outline" className="mt-6"><a href="#overview">Back to overview</a></Button></CardContent></Card>}
      </div>
      <footer className="px-4 pb-5 text-xs text-muted-foreground sm:px-6 md:px-8">Your space. Your pace.</footer>
    </SidebarInset>
  </>
}

export default function App() {
  return <AuthGate>{(session) => <SidebarProvider defaultOpen={document.cookie.split("; ").find((cookie) => cookie.startsWith("sidebar_state=")) !== "sidebar_state=false"}><Workspace session={session} /></SidebarProvider>}</AuthGate>
}

