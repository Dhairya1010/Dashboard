import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"
import type { Env } from "./env"
import { HttpError } from "./http"
import { authenticateLocal } from "./local-auth"

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function verifyAccessToken(token: string, env: Env, keys: JWTVerifyGetKey) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: env.ACCESS_ISSUER,
    audience: env.ACCESS_AUD,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "email"],
  })
  if (typeof payload.email !== "string" || payload.email !== env.OWNER_EMAIL ||
      typeof payload.sub !== "string" || !payload.sub) {
    throw new HttpError(403, "FORBIDDEN", "This account does not have access.")
  }
  return { subject: payload.sub, email: payload.email }
}

export async function authenticate(request: Request, env: Env) {
  if (env.AUTH_MODE === "local" || env.AUTH_MODE === "password") return authenticateLocal(request, env)
  if (env.AUTH_MODE !== "access" || !env.ACCESS_AUD || !env.OWNER_EMAIL ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER)) {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured.")
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion")
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.")
  let keys = keySets.get(env.ACCESS_ISSUER)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`))
    keySets.set(env.ACCESS_ISSUER, keys)
  }
  try {
    return await verifyAccessToken(token, env, keys)
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(401, "UNAUTHORIZED", "Your session could not be verified.")
  }
}
