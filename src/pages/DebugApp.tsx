import { MobileHeader } from "@/components/MobileHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function getMeta(name: string) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
}

export default function DebugApp() {
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (navigator as any).standalone === true;

  const isCapacitor = typeof (window as any).Capacitor !== "undefined";

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="Debug do App" showLogo={false} />
      <main className="container mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Build (meta)</span>
              <span className="font-mono break-all text-right">{getMeta("app-build") || "(sem)"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono break-all text-right">{window.location.host}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">URL</span>
              <span className="font-mono break-all text-right">{window.location.href}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ambiente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Standalone (PWA)</span>
              <span className="font-mono">{String(isStandalone)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Capacitor</span>
              <span className="font-mono">{String(isCapacitor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">User-Agent</span>
              <span className="font-mono break-all text-right">{navigator.userAgent}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
