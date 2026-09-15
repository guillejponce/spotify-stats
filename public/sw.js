self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Kurt CubAIn",
    body: "Hoy todavía no hay música. No me hagas dispararme.",
    url: "/kurt",
    tag: "kurt",
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag || "kurt",
      data: { url: data.url || "/kurt" },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || "/kurt";
  const dest = new URL(raw, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(dest);
            } catch {
              /* some browsers block navigate */
            }
          }
          return;
        }
      }
      if (clients.openWindow) await clients.openWindow(dest);
    })(),
  );
});
