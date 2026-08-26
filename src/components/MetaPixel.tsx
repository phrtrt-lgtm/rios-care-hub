import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
  }
}

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

let initialized = false;

export function initMetaPixel() {
  if (initialized) return;
  if (!PIXEL_ID) {
    console.warn("[MetaPixel] VITE_META_PIXEL_ID não configurado.");
    return;
  }
  initialized = true;

  const scriptId = "meta-pixel-script";
  if (document.getElementById(scriptId)) return;

  const n = window.fbq = function (...args: any[]) {
    if (window.fbq?.callMethod) {
      window.fbq.callMethod(...args);
    } else {
      (window.fbq?.queue || []).push(args);
    }
  };
  if (!window._fbq) window._fbq = window.fbq;
  window.fbq.push = window.fbq;
  window.fbq.version = "2.0";
  window.fbq.queue = [];

  const t = document.createElement("script");
  t.async = true;
  t.id = scriptId;
  t.src = `https://connect.facebook.net/en_US/fbevents.js`;

  const s = document.getElementsByTagName("script")[0];
  s.parentNode?.insertBefore(t, s);

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

export function trackMetaEvent(eventName: string, params?: Record<string, any>) {
  if (!PIXEL_ID || !initialized) {
    if (!PIXEL_ID) {
      console.warn(`[MetaPixel] Não disparou "${eventName}" — VITE_META_PIXEL_ID ausente.`);
    }
    return;
  }
  window.fbq?.("track", eventName, params);
}

export function MetaPixel() {
  useEffect(() => {
    initMetaPixel();
  }, []);
  return null;
}
