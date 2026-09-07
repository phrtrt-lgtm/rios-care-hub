export const PORTAL_URL = "https://portal.rioshospedagens.com.br";

export function portalLink(path: string) {
  return `${PORTAL_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
