export interface Env {
  DB: D1Database
  ENVIRONMENT: string
  AUTH_MODE: string
  APP_ORIGIN: string
  ACCESS_ISSUER: string
  ACCESS_AUD: string
  OWNER_EMAIL: string
  LOCAL_BOOTSTRAP_EMAIL: string
  LOCAL_BOOTSTRAP_PASSWORD: string
  LOCAL_BOOTSTRAP_ROLE: string
}
