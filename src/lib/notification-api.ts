import { ApiError } from "./api"
export interface DashboardNotification { id: string; reminderId: string | null; occurrenceAt: number; title: string; readAt: number | null; createdAt: number }
export interface PushConfig { supported: boolean; publicKey: string; enabled: boolean; devices: Array<{ id: string; name: string; createdAt: number }> }
async function request<T>(path: string, init: RequestInit = {}) { const response = await fetch(path, { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...init.headers } }); if (response.status === 204) return undefined as T; const body = await response.json().catch(() => null); if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "The request failed."); return body.data as T }
export const getNotifications = (signal?: AbortSignal) => request<DashboardNotification[]>("/api/notifications", { signal })
export const markNotificationRead = (id: string) => request<{ read: true }>(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })
export const markAllNotificationsRead = () => request<{ read: true }>("/api/notifications/read-all", { method: "POST" })
export const getPushConfig = (signal?: AbortSignal) => request<PushConfig>("/api/push/config", { signal })
export const savePushSubscription = (subscription: PushSubscription) => request<{ subscribed: true }>("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) })
export const removePushSubscription = (id: string) => request<void>(`/api/push/subscriptions/${id}`, { method: "DELETE" })
export function applicationServerKey(value: string) { const padding = "=".repeat((4 - value.length % 4) % 4), base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)) }
