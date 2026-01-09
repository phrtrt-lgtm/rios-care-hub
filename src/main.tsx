import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

async function maybeClearPwaCache() {
  // If running as an installed app (PWA) or inside a native wrapper, stale caches can trap users.
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // iOS Safari legacy
    (navigator as any).standalone === true;

  const isCapacitor = typeof (window as any).Capacitor !== "undefined";

  if (!isStandalone && !isCapacitor) return;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

maybeClearPwaCache().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});

