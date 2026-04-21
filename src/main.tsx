import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./index.css";

async function bootstrap() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);

  try {
    const { default: RootComponent } = Capacitor.isNativePlatform()
      ? await import("./NativeApp")
      : await import("./App");

    root.render(<RootComponent />);
  } catch (error) {
    console.error("GyanSetu startup failed", error);
    root.render(
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f5f8fa",
          color: "#09131f",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 12px", fontSize: "28px" }}>GyanSetu could not start</h1>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Please reopen the app. If this continues, rebuild and reinstall the Android app.
          </p>
        </div>
      </div>,
    );
  }
}

void bootstrap();

if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
