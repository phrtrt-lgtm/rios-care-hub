import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

async function clearStaleCaches() {
  // Clear any HTTP caches stored by previous SW versions to avoid stale content.
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Never register inside the Lovable editor preview iframe — it interferes
  // with hot reload and can serve stale content.
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    // Clean up any previously registered SW in preview contexts.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      // ignore
    }
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("Service worker registration failed:", err);
  }
}

clearStaleCaches().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
  // Register SW after render so it never blocks the initial paint.
  registerServiceWorker();
});

