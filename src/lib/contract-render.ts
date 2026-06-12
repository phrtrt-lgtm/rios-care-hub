/** Helpers para renderizar o template de contrato a partir do markdown salvo no banco. */

export type ContractRenderData = Record<string, string | number | null | undefined>;

const flatten = (obj: any, prefix = ""): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj ?? {})) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
};

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fillTemplate(template: string, data: Record<string, any>): string {
  const flat = flatten(data);
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = flat[key];
    if (v === null || v === undefined || v === "") return `___________`;
    return String(v);
  });
}

/** Converte o markdown final em HTML simples preservando os blocos do contrato. */
export function markdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); html.push(""); continue; }

    if (line.startsWith("# ")) { closeList(); html.push(`<h1 class="contract-h1">${inline(escape(line.slice(2)))}</h1>`); continue; }
    if (line.startsWith("## ")) {
      closeList();
      const rest = line.slice(3);
      const m = rest.match(/^(\d+)\s+(.*)$/);
      if (m) {
        html.push(`<h2 class="contract-h2"><span class="contract-chip">${m[1]}</span><span>${inline(escape(m[2]))}</span></h2>`);
      } else {
        html.push(`<h2 class="contract-h2">${inline(escape(rest))}</h2>`);
      }
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) { html.push('<ul class="contract-list">'); inList = true; }
      html.push(`<li>${inline(escape(line.slice(2)))}</li>`);
      continue;
    }
    closeList();
    if (line.startsWith("> ")) { html.push(`<blockquote class="contract-quote">${inline(escape(line.slice(2)))}</blockquote>`); continue; }
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      html.push(`<p class="contract-italic">${inline(escape(line.slice(1, -1)))}</p>`);
      continue;
    }
    html.push(`<p>${inline(escape(line))}</p>`);
  }
  closeList();
  return html.join("\n");
}

export const contractDocLabel = (kind: "fisica" | "juridica") => (kind === "juridica" ? "CNPJ" : "CPF");
