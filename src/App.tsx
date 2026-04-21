import { useState } from "react";
import LandingPage from "./LandingPage";
import UnifiedApp from "./UnifiedApp";

const OPEN_KEY = "gy_open_app";

function shouldShowLanding(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (new URLSearchParams(window.location.search).has("session")) {
    return false;
  }
  const { pathname } = window.location;
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return false;
  }
  if (sessionStorage.getItem(OPEN_KEY) === "1") {
    return false;
  }
  return true;
}

export default function App() {
  const [showLanding, setShowLanding] = useState(shouldShowLanding);

  if (showLanding) {
    return (
      <LandingPage
        onOpenApp={() => {
          sessionStorage.setItem(OPEN_KEY, "1");
          setShowLanding(false);
          if (window.location.pathname !== "/" || window.location.hash === "#features") {
            window.history.replaceState({}, "", "/");
          }
        }}
      />
    );
  }

  return <UnifiedApp />;
}
