import { Capacitor } from "@capacitor/core";

let nativeNotificationCounter = 1;

export async function requestNotificationAccess() {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.requestPermissions();
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch (error) {
    console.warn("Notification permission request failed.", error);
  }
}

export async function deliverNotification(title: string, body: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nativeNotificationCounter++,
            title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.warn("Notification delivery failed.", error);
  }
}
