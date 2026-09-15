import type { Env } from "./env"
import { HttpError } from "./http"

const encoder = new TextEncoder()
const SESSION_COOKIE = "dashboard_session"
const SESSION_TTL_SECONDS = 60 * 60 * 12
const PASSWORD_ITERATIONS = 120_000
const roles = new Set(["owner", "admin", "member", "viewer"])

interface LocalAccount {
  id: string
  access_subject: string
  email: string
  role: string
  password_hash: string | null
  password_salt: string | null
  password_iterations: number | null
}

interface SessionAccount {
  access_subject: string
  email: string
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

async function secretsMatch(actual: string, expected: string) {
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ])
  const actualBytes = new Uint8Array(actualDigest)
  const expectedBytes = new Uint8Array(expectedDigest)
  let difference = 0
  for (let index = 0; index < actualBytes.length; index += 1) difference |= actualBytes[index] ^ expectedBytes[index]
  return difference === 0
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PASSWORD_ITERATIONS) {
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
    const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
    return { hash: bytesToBase64Url(new Uint8Array(hash)), salt: bytesToBase64Url(salt), iterations }
  } catch {
    throw new HttpError(500, "PASSWORD_HASH_FAILED", "Secure password setup could not be completed.")
  }
}

export async function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number) {
  const actual = await hashPassword(password, base64UrlToBytes(salt), iterations)
  if (actual.hash.length !== expectedHash.length) return false
  let difference = 0
  for (let index = 0; index < actual.hash.length; index += 1) {
    difference |= actual.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index)
  }
  return difference === 0
}

export function isLocalAuthRequest(request: Request, env: Env) {
  const hostname = new URL(request.url).hostname
  return env.AUTH_MODE === "local" && env.ENVIRONMENT === "local" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
}

export function isPasswordAuthRequest(request: Request, env: Env) {
  if (isLocalAuthRequest(request, env)) return true
  const url = new URL(request.url)
  return env.AUTH_MODE === "password" && env.ENVIRONMENT === "production" &&
    url.protocol === "https:" && url.origin === env.APP_ORIGIN
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return value.join("=")
  }
  return undefined
}

function sessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
}

export async function authenticateLocal(request: Request, env: Env) {
  if (!isPasswordAuthRequest(request, env)) throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Password authentication is unavailable.")
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.")
  const account = await env.DB.prepare(
    `SELECT u.access_subject, u.email
     FROM local_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > unixepoch() LIMIT 1`,
  ).bind(await sha256(token)).first<SessionAccount>()
  if (!account) throw new HttpError(401, "UNAUTHORIZED", "Your local session has expired.")
  return { subject: account.access_subject, email: account.email }
}

export async function signInLocal(request: Request, env: Env) {
  if (!isPasswordAuthRequest(request, env)) throw new HttpError(404, "NOT_FOUND", "Route not found.")
  if ((Number(request.headers.get("Content-Length")) || 0) > 4096) throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.")
  let input: unknown
  try { input = await request.json() } catch { throw new HttpError(400, "INVALID_INPUT", "Enter a valid email and password.") }
  const email = typeof (input as { email?: unknown })?.email === "string" ? (input as { email: string }).email.trim().toLowerCase() : ""
  const password = typeof (input as { password?: unknown })?.password === "string" ? (input as { password: string }).password : ""
  if (!/^\S+@\S+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 256) {
    throw new HttpError(400, "INVALID_INPUT", "Enter a valid email and a password of at least 12 characters.")
  }

  if (env.AUTH_MODE === "password") {
    if (typeof env.LOCAL_BOOTSTRAP_PASSWORD !== "string" ||
        email !== env.LOCAL_BOOTSTRAP_EMAIL.toLowerCase() ||
        !await secretsMatch(password, env.LOCAL_BOOTSTRAP_PASSWORD) ||
        !roles.has(env.LOCAL_BOOTSTRAP_ROLE)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.")
    }
    let productionAccount = await env.DB.prepare(
      "SELECT id, email, role FROM users WHERE email = ? LIMIT 1",
    ).bind(email).first<{ id: string; email: string; role: string }>()
    if (!productionAccount) {
      const id = crypto.randomUUID()
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id, access_subject, email, role) VALUES (?, ?, ?, ?)")
          .bind(id, `password:${email}`, email, env.LOCAL_BOOTSTRAP_ROLE),
        env.DB.prepare("INSERT INTO settings (user_id) VALUES (?)").bind(id),
      ])
      productionAccount = { id, email, role: env.LOCAL_BOOTSTRAP_ROLE }
    } else {
      await env.DB.prepare("UPDATE users SET access_subject = ?, role = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(`password:${email}`, env.LOCAL_BOOTSTRAP_ROLE, productionAccount.id).run()
      productionAccount = { ...productionAccount, role: env.LOCAL_BOOTSTRAP_ROLE }
    }
    const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
    await env.DB.batch([
      env.DB.prepare("DELETE FROM local_sessions WHERE expires_at <= unixepoch()"),
      env.DB.prepare("INSERT INTO local_sessions (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + ?)")
        .bind(await sha256(token), productionAccount.id, SESSION_TTL_SECONDS),
    ])
    return { account: productionAccount, cookie: sessionCookie(token, SESSION_TTL_SECONDS, true) }
  }

  let account = await env.DB.prepare(
    `SELECT u.id, u.access_subject, u.email, u.role, c.password_hash, c.password_salt, c.password_iterations
     FROM users u LEFT JOIN local_credentials c ON c.user_id = u.id
     WHERE u.email = ? LIMIT 1`,
  ).bind(email).first<LocalAccount>()

  if (!account) {
    if (email !== env.LOCAL_BOOTSTRAP_EMAIL.toLowerCase() || password !== env.LOCAL_BOOTSTRAP_PASSWORD || !roles.has(env.LOCAL_BOOTSTRAP_ROLE)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.")
    }
    const id = crypto.randomUUID()
    const credential = await hashPassword(password)
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, access_subject, email, role) VALUES (?, ?, ?, ?)")
        .bind(id, `local:${email}`, email, env.LOCAL_BOOTSTRAP_ROLE),
      env.DB.prepare("INSERT INTO settings (user_id) VALUES (?)").bind(id),
      env.DB.prepare("INSERT INTO local_credentials (user_id, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?)")
        .bind(id, credential.hash, credential.salt, credential.iterations),
    ])
    account = { id, access_subject: `local:${email}`, email, role: env.LOCAL_BOOTSTRAP_ROLE,
      password_hash: credential.hash, password_salt: credential.salt, password_iterations: credential.iterations }
  } else if (!account.password_hash || !account.password_salt || !account.password_iterations) {
    if (email !== env.LOCAL_BOOTSTRAP_EMAIL.toLowerCase() || password !== env.LOCAL_BOOTSTRAP_PASSWORD || !roles.has(env.LOCAL_BOOTSTRAP_ROLE)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.")
    }
    const credential = await hashPassword(password)
    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET access_subject = ?, role = ?, updated_at = unixepoch() WHERE id = ?")
          .bind(`local:${email}`, env.LOCAL_BOOTSTRAP_ROLE, account.id),
        env.DB.prepare("INSERT INTO local_credentials (user_id, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?)")
          .bind(account.id, credential.hash, credential.salt, credential.iterations),
      ])
    } catch {
      throw new HttpError(500, "ACCOUNT_MIGRATION_FAILED", "The existing account could not be prepared for password sign-in.")
    }
    account = { ...account, access_subject: `local:${email}`, role: env.LOCAL_BOOTSTRAP_ROLE,
      password_hash: credential.hash, password_salt: credential.salt, password_iterations: credential.iterations }
  } else if (!await verifyPassword(password, account.password_hash, account.password_salt, account.password_iterations)) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.")
  }

  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  await env.DB.batch([
    env.DB.prepare("DELETE FROM local_sessions WHERE expires_at <= unixepoch()"),
    env.DB.prepare("INSERT INTO local_sessions (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + ?)")
      .bind(await sha256(token), account.id, SESSION_TTL_SECONDS),
  ])
  return { account: { id: account.id, email: account.email, role: account.role }, cookie: sessionCookie(token, SESSION_TTL_SECONDS, env.ENVIRONMENT === "production") }
}

export async function signOutLocal(request: Request, env: Env) {
  if (!isPasswordAuthRequest(request, env)) throw new HttpError(404, "NOT_FOUND", "Route not found.")
  const token = readCookie(request, SESSION_COOKIE)
  if (token) await env.DB.prepare("DELETE FROM local_sessions WHERE token_hash = ?").bind(await sha256(token)).run()
  return sessionCookie("", 0, env.ENVIRONMENT === "production")
}
