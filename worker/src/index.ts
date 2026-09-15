import { authenticate } from "./auth"
import type { Env } from "./env"
import { HttpError, json } from "./http"
import { isPasswordAuthRequest, signInLocal, signOutLocal } from "./local-auth"

interface UserRecord {
  id: string
  email: string
  role: string
}

export async function provisionUser(env: Env, identity: { subject: string; email: string }): Promise<UserRecord> {
  const existing = await env.DB.prepare(
    "SELECT id, email, role FROM users WHERE access_subject = ? LIMIT 1",
  ).bind(identity.subject).first<UserRecord>()
  if (existing) return existing

  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, access_subject, email, role) VALUES (?, ?, ?, 'admin')",
    ).bind(id, identity.subject, identity.email),
    env.DB.prepare(
      "INSERT OR IGNORE INTO settings (user_id) SELECT id FROM users WHERE access_subject = ?",
    ).bind(identity.subject),
  ])
  const created = await env.DB.prepare(
    "SELECT id, email, role FROM users WHERE access_subject = ? LIMIT 1",
  ).bind(identity.subject).first<UserRecord>()
  if (!created) throw new Error("User provisioning failed")
  return created
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (pathname === "/api/health" && request.method === "GET") {
    return json({ data: { status: "ok", service: "dashboard-api" } })
  }
  if (pathname === "/api/auth/config" && request.method === "GET") {
    return json({ data: { mode: isPasswordAuthRequest(request, env) ? "password" : "access" } })
  }
  if (pathname === "/api/auth/login" && request.method === "POST") {
    const { account, cookie } = await signInLocal(request, env)
    const response = json({ data: { user: account, environment: env.ENVIRONMENT } })
    response.headers.set("Set-Cookie", cookie)
    return response
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const response = json({ data: { signedOut: true } })
    response.headers.set("Set-Cookie", await signOutLocal(request, env))
    return response
  }
  if (!pathname.startsWith("/api/")) throw new HttpError(404, "NOT_FOUND", "Route not found.")
  const identity = await authenticate(request, env)
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }), {
      status: 405, headers: { "Allow": "GET", "Content-Type": "application/json" },
    })
  }
  if (pathname === "/api/ready") {
    // Verify the migration exists, not just that the database can execute SQL.
    await env.DB.prepare("SELECT id FROM users LIMIT 1").all()
    return json({ data: { status: "ready", database: "ok" } })
  }
  if (pathname === "/api/session") {
    const user = await provisionUser(env, identity)
    return json({ data: { user, environment: env.ENVIRONMENT } })
  }
  throw new HttpError(404, "NOT_FOUND", "Route not found.")
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get("Origin")
    let response: Response
    try {
      // Exact origin matching also protects future mutation routes from CSRF.
      if (origin && origin !== env.APP_ORIGIN) throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed.")
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && (!origin || origin !== env.APP_ORIGIN)) {
        throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "A trusted origin is required.")
      }
      if (request.method === "OPTIONS") {
        if (!origin || origin !== env.APP_ORIGIN) throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed.")
        response = new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
          "Access-Control-Max-Age": "600",
        } })
      } else {
        response = await route(request, env)
      }
    } catch (error) {
      if (error instanceof HttpError) {
        response = json({ error: { code: error.code, message: error.message }, requestId }, error.status)
      } else {
        // Do not log tokens, personal content, or raw database errors.
        console.error(JSON.stringify({ requestId, code: "INTERNAL_ERROR" }))
        response = json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }, requestId }, 500)
      }
    }
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("Referrer-Policy", "no-referrer")
    response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    response.headers.set("X-Request-Id", requestId)
    response.headers.set("Vary", "Origin")
    if (origin && origin === env.APP_ORIGIN) {
      response.headers.set("Access-Control-Allow-Origin", origin)
      response.headers.set("Access-Control-Allow-Credentials", "true")
    }
    return response
  },
} satisfies ExportedHandler<Env>
