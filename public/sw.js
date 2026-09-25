self.addEventListener("push", (event) => {
  let payload = { title: "Dashboard reminder", body: "A reminder is due.", url: "#reminders" }
  try { payload = { ...payload, ...event.data.json() } } catch { /* Use the safe fallback. */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/dashboard-icon.svg",
    badge: "/dashboard-icon.svg",
    tag: payload.notificationId || undefined,
    data: { url: payload.url || "#notifications" },
  }))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || "#notifications", self.location.origin).href
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) { if ("focus" in client) { client.navigate(destination); return client.focus() } }
    return clients.openWindow(destination)
  }))
})
