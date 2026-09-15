import { beforeAll, describe, expect, it, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import api, { provisionUser } from "../src/index"
import { authenticate, verifyAccessToken } from "../src/auth"
import type { Env } from "../src/env"
import { authenticateLocal, isLocalAuthRequest, signInLocal, verifyPassword } from "../src/local-auth"

const env = {
  ENVIRONMENT: "production", AUTH_MODE: "access", APP_ORIGIN: "https://dashboard.example.com",
  ACCESS_ISSUER: "https://test.cloudflareaccess.com", ACCESS_AUD: "dashboard", OWNER_EMAIL: "owner@example.com",
  LOCAL_BOOTSTRAP_EMAIL: "owner@example.com", LOCAL_BOOTSTRAP_PASSWORD: "local-password-only", LOCAL_BOOTSTRAP_ROLE: "owner",
} as Env
const request = (path: string, init?: RequestInit) => new Request(`https://api.example.com${path}`, init)

function testDatabase() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec(readFileSync(new URL("../migrations/0001_core.sql", import.meta.url), "utf8"))
  sqlite.exec(readFileSync(new URL("../migrations/0002_local_auth_roles.sql", import.meta.url), "utf8"))
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
  const DB = {
    prepare,
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database
  return { DB, sqlite }
}

describe("API boundary", () => {
  it("exposes only the health endpoint without authentication", async () => {
    expect((await api.fetch(request("/api/health"), env)).status).toBe(200)
    for (const path of ["/api/session", "/api/ready", "/api/todos"]) {
      const response = await api.fetch(request(path), env)
      expect(response.status).toBe(401)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
    }
  })
  it("fails closed when production authentication is missing", async () => {
    expect((await api.fetch(request("/api/session"), { ...env, ACCESS_AUD: "" })).status).toBe(503)
  })
  it("rejects untrusted origins and mutations without Origin", async () => {
    expect((await api.fetch(request("/api/session", { headers: { Origin: "https://evil.example" } }), env)).status).toBe(403)
    expect((await api.fetch(request("/api/session", { method: "POST" }), env)).status).toBe(403)
  })
  it("allows preflight only for the configured origin", async () => {
    const response = await api.fetch(request("/api/session", { method: "OPTIONS", headers: { Origin: env.APP_ORIGIN } }), env)
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(env.APP_ORIGIN)
  })
  it("limits development identity to explicitly configured loopback requests", async () => {
    const local = { ...env, ENVIRONMENT: "local", AUTH_MODE: "local" }
    expect(isLocalAuthRequest(new Request("http://127.0.0.1:8787/api/session"), local)).toBe(true)
    await expect(authenticate(new Request("http://127.0.0.1:8787/api/session"), local)).rejects.toMatchObject({ status: 401 })
    await expect(authenticate(request("/api/session"), local)).rejects.toMatchObject({ status: 503 })
    await expect(authenticate(new Request("http://localhost/api/session"), { ...local, ENVIRONMENT: "production" })).rejects.toMatchObject({ status: 503 })
  })
  it("returns a safe database failure without leaking details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const DB = { prepare: (sql: string) => {
      if (sql.includes("FROM local_sessions")) return { bind: () => ({ first: async () => ({ access_subject: "local:owner@example.com", email: env.OWNER_EMAIL }) }) }
      throw new Error("secret database detail")
    } } as unknown as D1Database
    const local = { ...env, ENVIRONMENT: "local", AUTH_MODE: "local", DB }
    const response = await api.fetch(new Request("http://localhost/api/ready", { headers: { Cookie: "dashboard_session=test" } }), local)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain("secret database detail")
    log.mockRestore()
  })
})

describe("Access JWT verification", () => {
  let pair: Awaited<ReturnType<typeof generateKeyPair>>
  let keys: ReturnType<typeof createLocalJWKSet>
  beforeAll(async () => {
    pair = await generateKeyPair("RS256")
    keys = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] })
  })
  const token = (claims: Record<string, unknown> = {}, key?: CryptoKey) => new SignJWT({ email: env.OWNER_EMAIL, ...claims })
    .setProtectedHeader({ alg: "RS256" }).setSubject("owner-id").setIssuedAt()
    .setIssuer(typeof claims.iss === "string" ? claims.iss : env.ACCESS_ISSUER)
    .setAudience(typeof claims.aud === "string" ? claims.aud : env.ACCESS_AUD)
    .setExpirationTime(typeof claims.exp === "number" ? claims.exp : "1h").sign(key ?? pair.privateKey)
  it("accepts a signed token for the permitted owner", async () => {
    await expect(verifyAccessToken(await token(), env, keys)).resolves.toEqual({ subject: "owner-id", email: env.OWNER_EMAIL })
  })
  it.each([{ email: "other@example.com" }, { iss: "https://wrong.example.com" }, { aud: "wrong-app" }, { exp: 1 }])("rejects invalid claims %j", async (claims) => {
    await expect(verifyAccessToken(await token(claims), env, keys)).rejects.toThrow()
  })
  it("rejects tokens signed by another key", async () => {
    const attacker = await generateKeyPair("RS256")
    await expect(verifyAccessToken(await token({}, attacker.privateKey), env, keys)).rejects.toThrow()
  })
  it("rejects a token without expiry", async () => {
    const missingExpiry = await new SignJWT({ email: env.OWNER_EMAIL }).setProtectedHeader({ alg: "RS256" })
      .setSubject("owner-id").setIssuedAt().setIssuer(env.ACCESS_ISSUER).setAudience(env.ACCESS_AUD).sign(pair.privateKey)
    await expect(verifyAccessToken(missingExpiry, env, keys)).rejects.toThrow()
  })
})

describe("authenticated user provisioning", () => {
  it("creates one user and default settings, then reuses the same account", async () => {
    const { DB, sqlite } = testDatabase()
    const identity = { subject: "access-subject", email: env.OWNER_EMAIL }
    const first = await provisionUser({ ...env, DB }, identity)
    const second = await provisionUser({ ...env, DB }, identity)

    expect(second).toEqual(first)
    expect(first.email).toBe(env.OWNER_EMAIL)
    expect(first.role).toBe("admin")
    expect(sqlite.prepare("SELECT count(*) AS count FROM users").get()?.count).toBe(1)
    expect(sqlite.prepare("SELECT count(*) AS count FROM settings").get()?.count).toBe(1)
    sqlite.close()
  })
})

describe("local account authentication", () => {
  it("bootstraps a role-bearing account and authenticates its session cookie", async () => {
    const { DB, sqlite } = testDatabase()
    const local = { ...env, DB, ENVIRONMENT: "local", AUTH_MODE: "local" }
    const request = new Request("http://127.0.0.1:8787/api/auth/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.LOCAL_BOOTSTRAP_EMAIL, password: env.LOCAL_BOOTSTRAP_PASSWORD }),
    })
    const signedIn = await signInLocal(request, local)
    expect(signedIn.account.role).toBe("owner")
    const cookie = signedIn.cookie.split(";", 1)[0]
    await expect(authenticateLocal(new Request("http://127.0.0.1:8787/api/session", { headers: { Cookie: cookie } }), local))
      .resolves.toMatchObject({ email: env.LOCAL_BOOTSTRAP_EMAIL })
    const credential = sqlite.prepare("SELECT password_hash, password_salt, password_iterations FROM local_credentials").get() as { password_hash: string; password_salt: string; password_iterations: number }
    expect(await verifyPassword(env.LOCAL_BOOTSTRAP_PASSWORD, credential.password_hash, credential.password_salt, credential.password_iterations)).toBe(true)
    expect(credential.password_hash).not.toContain(env.LOCAL_BOOTSTRAP_PASSWORD)
    sqlite.close()
  })

  it("adopts an existing Access-created user on first password sign-in", async () => {
    const { DB, sqlite } = testDatabase()
    sqlite.prepare("INSERT INTO users (id, access_subject, email, role) VALUES (?, ?, ?, ?)")
      .run("existing-user", "access-subject", env.LOCAL_BOOTSTRAP_EMAIL, "admin")
    sqlite.prepare("INSERT INTO settings (user_id) VALUES (?)").run("existing-user")
    const passwordEnv = { ...env, DB, ENVIRONMENT: "production", AUTH_MODE: "password", APP_ORIGIN: "https://api.example.com", LOCAL_BOOTSTRAP_ROLE: "admin" }
    const loginRequest = new Request("https://api.example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.LOCAL_BOOTSTRAP_EMAIL, password: env.LOCAL_BOOTSTRAP_PASSWORD }),
    })

    const signedIn = await signInLocal(loginRequest, passwordEnv)

    expect(signedIn.account).toMatchObject({ id: "existing-user", email: env.LOCAL_BOOTSTRAP_EMAIL, role: "admin" })
    expect(signedIn.cookie).toContain("; Secure")
    expect(sqlite.prepare("SELECT count(*) AS count FROM users").get()?.count).toBe(1)
    expect(sqlite.prepare("SELECT count(*) AS count FROM local_credentials").get()?.count).toBe(0)
    expect(sqlite.prepare("SELECT access_subject FROM users WHERE id = 'existing-user'").get()?.access_subject).toBe(`password:${env.LOCAL_BOOTSTRAP_EMAIL}`)
    sqlite.close()
  })
})
