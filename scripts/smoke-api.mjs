import assert from "node:assert/strict"

const origin = process.argv[2] ?? "http://127.0.0.1:8787"
for (const [path, field, expected] of [
  ["/api/health", "status", "ok"],
  ["/api/ready", "database", "ok"],
  ["/api/session", "environment", "local"],
]) {
  const response = await fetch(`${origin}${path}`)
  assert.equal(response.status, 200, `${path} status`)
  const body = await response.json()
  assert.equal(body.data[field], expected, `${path} body`)
  assert.equal(response.headers.get("cache-control"), "no-store")
  console.log(`PASS ${path}`)
}
const rejected = await fetch(`${origin}/api/session`, { headers: { Origin: "https://untrusted.example" } })
assert.equal(rejected.status, 403)
console.log("PASS untrusted origin rejected")
