import { useSessionHandler } from "@/hooks/useSessionHandler";

export function SessionHandlerWrapper({ children }: { children: React.ReactNode }) {
  useSessionHandler();
  return <>{children}</>;
}
