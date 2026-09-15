import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react"
import { LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError, getAuthConfig, getSession, passwordSignIn, type Session } from "@/lib/api"

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; session: Session }
  | { status: "password-sign-in" }
  | { status: "error"; error: ApiError }

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" })

  const loadSession = useCallback(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    getSession(controller.signal).then((session) => setState({ status: "authenticated", session })).catch(async (error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          try {
            const config = await getAuthConfig(controller.signal)
            if (config.mode === "password") { setState({ status: "password-sign-in" }); return }
          } catch { /* Surface the original session error below. */ }
        }
        setState({
          status: "error",
          error: error instanceof ApiError
            ? error
            : new ApiError(0, "CONNECTION_FAILED", "The dashboard could not verify your session."),
        })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => loadSession(), [loadSession])

  if (state.status === "authenticated") return children(state.session)
  if (state.status === "password-sign-in") {
    return <PasswordSignIn onSuccess={(session) => setState({ status: "authenticated", session })} />
  }

  if (state.status === "loading") {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
        <div role="status" aria-live="polite">
          <LoaderCircle className="mx-auto mb-4 size-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">Verifying your session…</p>
        </div>
      </main>
    )
  }

  const signedOut = state.error.status === 401
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-7 text-center text-card-foreground">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-accent">
          <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {signedOut ? "Your session has ended" : "We couldn’t verify your session"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {signedOut ? "Sign in through Cloudflare Access to return to your dashboard." : state.error.message}
        </p>
        <Button className="mt-6" onClick={() => signedOut ? window.location.reload() : loadSession()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {signedOut ? "Sign in again" : "Try again"}
        </Button>
        {state.error.code === "AUTH_NOT_CONFIGURED" && (
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Cloudflare Access settings are required before this dashboard can open.</p>
        )}
      </section>
    </main>
  )
}

function PasswordSignIn({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage("")
    try {
      onSuccess(await passwordSignIn(email, password))
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Sign-in failed. Try again.")
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-7 text-card-foreground">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-accent">
            <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to your private dashboard.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div><label htmlFor="sign-in-email" className="mb-2 block text-sm font-medium">Email</label><input id="sign-in-email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          <div><label htmlFor="sign-in-password" className="mb-2 block text-sm font-medium">Password</label><input id="sign-in-password" name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
          <Button type="submit" className="h-11 w-full" disabled={submitting}>{submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{submitting ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Only the configured administrator account can sign in.</p>
      </section>
    </main>
  )
}
