import { useEffect } from "react";

type FbqMethod = "init" | "track" | "trackCustom" | "callMethod" | string;

interface FbqQueueItem {
  method?: FbqMethod;
  args?: any[];
}

interface FbqFunction extends Function {
  (method: FbqMethod, ...args: any[]): void;
  callMethod?: (...args: any[]) => void;
  queue?: FbqQueueItem[];
  push?: (item: FbqQueueItem) => void;
  version?: string;
}

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
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

  const queue: FbqQueueItem[] = [];
  const fbq: FbqFunction = function (method: FbqMethod, ...args: any[]) {
    if (fbq.callMethod) {
      fbq.callMethod(method, ...args);
    } else {
      queue.push({ method, args });
    }
  } as FbqFunction;

  fbq.callMethod = function (method: FbqMethod, ...args: any[]) {
    queue.push({ method, args });
  };
  fbq.push = function (item: FbqQueueItem) {
    queue.push(item);
  };
  fbq.version = "2.0";
  fbq.queue = queue;

  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;

  const t = document.createElement("script");
  t.async = true;
  t.id = scriptId;
  t.src = `https://connect.facebook.net/en_US/fbevents.js`;

  const s = document.getElementsByTagName("script")[0];
  s.parentNode?.insertBefore(t, s);

  fbq("init", PIXEL_ID);
  fbq("track", "PageView");
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
