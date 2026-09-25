import { writeFile } from "node:fs/promises"

const required = ["D1_DATABASE_ID", "APP_ORIGIN", "OWNER_EMAIL"]
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  throw new Error(`Missing production configuration: ${missing.join(", ")}`)
}

const config = {
  $schema: "../node_modules/wrangler/config-schema.json",
  name: "personal-dashboard-api",
  main: "src/index.ts",
  compatibility_date: "2026-09-01",
  workers_dev: true,
  preview_urls: false,
  assets: {
    directory: "../dist",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*"],
  },
  vars: {
    ENVIRONMENT: "production",
    AUTH_MODE: "password",
    APP_ORIGIN: process.env.APP_ORIGIN,
    ACCESS_ISSUER: "",
    ACCESS_AUD: "",
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    LOCAL_BOOTSTRAP_EMAIL: process.env.OWNER_EMAIL,
    LOCAL_BOOTSTRAP_ROLE: "admin",
    VAPID_SUBJECT: `mailto:${process.env.OWNER_EMAIL}`,
    VAPID_PUBLIC_KEY: "BH_cmkYZUPEG1yaHlH9J5QzN36aKN-sEWqNKhnWVUFike_hw9Guynel4HXtKh28kLLzRgpHRTGEAg_3dBWt14qE",
  },
  triggers: { crons: ["* * * * *"] },
  d1_databases: [{
    binding: "DB",
    database_name: "personal-dashboard",
    database_id: process.env.D1_DATABASE_ID,
    migrations_dir: "migrations",
  }],
}

await writeFile(
  new URL("../worker/wrangler.production.jsonc", import.meta.url),
  `${JSON.stringify(config, null, 2)}\n`,
  { mode: 0o600 },
)
