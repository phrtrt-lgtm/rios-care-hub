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

const PIXEL_ID = "1039803078837670";

let initialized = false;

export function initMetaPixel() {
  if (initialized) return;
  initialized = true;

  if (!window.fbq) {
    const fbq: FbqFunction = function (...args: any[]) {
      if (!args.length) return;
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, args);
      } else {
        fbq.queue!.push(args as any);
      }
    } as FbqFunction;

    fbq.push = fbq as any;
    fbq.version = "2.0";
    fbq.queue = [];

    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }

  const scriptId = "meta-pixel-script";
  if (!document.getElementById(scriptId)) {
    const t = document.createElement("script");
    t.async = true;
    t.id = scriptId;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    const s = document.getElementsByTagName("script")[0];
    if (s?.parentNode) s.parentNode.insertBefore(t, s);
    else document.head.appendChild(t);
  }

  window.fbq?.("init", PIXEL_ID);
  window.fbq?.("track", "PageView");
}

export function trackMetaEvent(eventName: string, params?: Record<string, any>) {
  if (!eventName) return;
  if (!initialized) initMetaPixel();
  window.fbq?.("track", eventName, params);
}


export function MetaPixel() {
  useEffect(() => {
    initMetaPixel();
  }, []);
  return null;
}
