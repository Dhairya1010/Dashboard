import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push"
import type { Env } from "./env"
import { HttpError, json } from "./http"

interface DueReminder { id: string; user_id: string; title: string; due_at: number; recurrence: "none" | "daily" | "weekly" | "monthly" }
interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }
interface Delivery { status: string; attempts: number }

function nextOccurrence(timestamp: number, recurrence: DueReminder["recurrence"]) {
  const date = new Date(timestamp * 1000)
  if (recurrence === "daily") date.setUTCDate(date.getUTCDate() + 1)
  if (recurrence === "weekly") date.setUTCDate(date.getUTCDate() + 7)
  if (recurrence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1)
  return Math.floor(date.getTime() / 1000)
}

async function sendPush(env: Env, notificationId: string, reminder: DueReminder, subscription: StoredSubscription) {
  await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries (id, notification_id, subscription_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), notificationId, subscription.id).run()
  const delivery = await env.DB.prepare("SELECT status, attempts FROM notification_deliveries WHERE notification_id = ? AND subscription_id = ?").bind(notificationId, subscription.id).first<Delivery>()
  if (!delivery || delivery.status === "delivered" || delivery.attempts >= 3) return
  try {
    if (!env.VAPID_SUBJECT || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error("VAPID_NOT_CONFIGURED")
    const pushSubscription: PushSubscription = { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }
    const payload = await buildPushPayload({ data: JSON.stringify({ title: reminder.title, body: "Reminder due now", url: "#reminders", notificationId }), options: { ttl: 300 } }, pushSubscription, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY })
    const response = await fetch(subscription.endpoint, payload)
    if (response.ok) {
      await env.DB.prepare("UPDATE notification_deliveries SET status = 'delivered', attempts = attempts + 1, response_status = ?, delivered_at = unixepoch(), updated_at = unixepoch() WHERE notification_id = ? AND subscription_id = ?").bind(response.status, notificationId, subscription.id).run()
    } else {
      await env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', attempts = attempts + 1, response_status = ?, last_error = ?, updated_at = unixepoch() WHERE notification_id = ? AND subscription_id = ?").bind(response.status, `HTTP_${response.status}`, notificationId, subscription.id).run()
      if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run()
    }
  } catch (error) {
    const code = error instanceof Error && error.message === "VAPID_NOT_CONFIGURED" ? error.message : "PUSH_FAILED"
    await env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = unixepoch() WHERE notification_id = ? AND subscription_id = ?").bind(code, notificationId, subscription.id).run()
  }
}

export async function processDueReminders(env: Env) {
  const due = await env.DB.prepare("SELECT id, user_id, title, due_at, recurrence FROM reminders WHERE status = 'pending' AND due_at <= unixepoch() ORDER BY due_at LIMIT 25").all<DueReminder>()
  for (const reminder of due.results) {
    await env.DB.prepare("INSERT OR IGNORE INTO notifications (id, user_id, reminder_id, occurrence_at, title) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), reminder.user_id, reminder.id, reminder.due_at, reminder.title).run()
    const notification = await env.DB.prepare("SELECT id FROM notifications WHERE reminder_id = ? AND occurrence_at = ?").bind(reminder.id, reminder.due_at).first<{ id: string }>()
    if (notification) {
      const subscriptions = await env.DB.prepare("SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN settings s ON s.user_id = p.user_id WHERE p.user_id = ? AND s.web_push_enabled = 1").bind(reminder.user_id).all<StoredSubscription>()
      await Promise.all(subscriptions.results.map((subscription) => sendPush(env, notification.id, reminder, subscription)))
    }
    if (reminder.recurrence === "none") await env.DB.prepare("UPDATE reminders SET status = 'sent', updated_at = unixepoch() WHERE id = ? AND due_at = ?").bind(reminder.id, reminder.due_at).run()
    else await env.DB.prepare("UPDATE reminders SET due_at = ?, updated_at = unixepoch() WHERE id = ? AND due_at = ?").bind(nextOccurrence(reminder.due_at, reminder.recurrence), reminder.id, reminder.due_at).run()
  }
  return { processed: due.results.length }
}

export async function handleNotifications(request: Request, env: Env, user: { id: string; role: string }, pathname: string) {
  if (pathname === "/api/push/config" && request.method === "GET") {
    const settings = await env.DB.prepare("SELECT web_push_enabled FROM settings WHERE user_id = ?").bind(user.id).first<{ web_push_enabled: number }>()
    const subscriptions = await env.DB.prepare("SELECT id, user_agent, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all<{ id: string; user_agent: string; created_at: number }>()
    return json({ data: { supported: Boolean(env.VAPID_PUBLIC_KEY), publicKey: env.VAPID_PUBLIC_KEY || "", enabled: settings?.web_push_enabled === 1, devices: subscriptions.results.map((item) => ({ id: item.id, name: item.user_agent || "Browser device", createdAt: item.created_at })) } })
  }
  if (pathname === "/api/push/subscriptions" && request.method === "POST") {
    if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.")
    let input: Record<string, unknown>; try { input = await request.json() as Record<string, unknown> } catch { throw new HttpError(400, "INVALID_INPUT", "Invalid push subscription.") }
    const keys = input.keys as Record<string, unknown> | undefined
    if (typeof input.endpoint !== "string" || !input.endpoint.startsWith("https://") || input.endpoint.length > 2048 || typeof keys?.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 512 || keys.auth.length > 512) throw new HttpError(400, "INVALID_INPUT", "Invalid push subscription.")
    const id = crypto.randomUUID(), agent = (request.headers.get("User-Agent") ?? "").slice(0, 300)
    await env.DB.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, updated_at = unixepoch()").bind(id, user.id, input.endpoint, keys.p256dh, keys.auth, agent).run()
    await env.DB.prepare("UPDATE settings SET web_push_enabled = 1, updated_at = unixepoch() WHERE user_id = ?").bind(user.id).run()
    return json({ data: { subscribed: true } }, 201)
  }
  const subscriptionMatch = pathname.match(/^\/api\/push\/subscriptions\/([0-9a-f-]+)$/i)
  if (subscriptionMatch && request.method === "DELETE") {
    if (user.role === "viewer") throw new HttpError(403, "READ_ONLY", "This account has read-only access.")
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?").bind(subscriptionMatch[1], user.id).run()
    const remaining = await env.DB.prepare("SELECT count(*) AS count FROM push_subscriptions WHERE user_id = ?").bind(user.id).first<{ count: number }>()
    if (!remaining?.count) await env.DB.prepare("UPDATE settings SET web_push_enabled = 0, updated_at = unixepoch() WHERE user_id = ?").bind(user.id).run()
    return new Response(null, { status: 204 })
  }
  if (pathname === "/api/notifications" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id, reminder_id, occurrence_at, title, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all<{ id: string; reminder_id: string | null; occurrence_at: number; title: string; read_at: number | null; created_at: number }>()
    return json({ data: rows.results.map((item) => ({ id: item.id, reminderId: item.reminder_id, occurrenceAt: item.occurrence_at, title: item.title, readAt: item.read_at, createdAt: item.created_at })) })
  }
  const notificationMatch = pathname.match(/^\/api\/notifications\/([0-9a-f-]+)$/i)
  if (notificationMatch && request.method === "PATCH") {
    await env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, unixepoch()) WHERE id = ? AND user_id = ?").bind(notificationMatch[1], user.id).run()
    return json({ data: { read: true } })
  }
  if (pathname === "/api/notifications/read-all" && request.method === "POST") {
    await env.DB.prepare("UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL").bind(user.id).run()
    return json({ data: { read: true } })
  }
  return null
}
