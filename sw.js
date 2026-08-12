self.addEventListener("push", event => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }

    const title = data.title || "MEFCO Watch";

    const options = {
        body: data.body || "New MEFCO update",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag || "mefco-watch",
        data: {
            url: data.url || "/"
        }
    };

    event.waitUntil(
        self.registration.showNotification(
            title,
            options
        )
    );
});


self.addEventListener("notificationclick", event => {

    event.notification.close();

    const url =
        event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(clientList => {

            for (const client of clientList) {

                if ("focus" in client) {
                    client.navigate(url);
                    return client.focus();
                }

            }

            if (clients.openWindow) {
                return clients.openWindow(url);
            }

        })
    );

});