import { useMemo } from "react";
import { fillTemplate, markdownToHtml, formatBRL, contractDocLabel } from "@/lib/contract-render";

interface Props {
  templateMd: string;
  contract: {
    commission_percent: number;
    term_months: number;
    start_date?: string | null;
    maintenance_limit_cents: number;
    specific_terms?: string | null;
  };
  owner: any;
  property: any;
  submission?: any;
}

const RIOS = {
  name: "RIOS Hospedagens Ltda.",
  cnpj: "—",
  address: "Cabo Frio/RJ",
  email: "contato@rioshospedagens.com.br",
  phone: "(22) —",
};

export function ContractTemplatePreview({ templateMd, contract, owner, property, submission }: Props) {
  const html = useMemo(() => {
    const sub = submission?.submitted_data ?? {};
    const ownerKind: "fisica" | "juridica" = sub.entity_kind === "juridica" ? "juridica" : "fisica";
    const data = {
      owner: {
        name: sub.legal_name || owner?.name || "",
        doc: sub.document || "",
        doc_label: contractDocLabel(ownerKind),
        address: sub.address_full || "",
        email: sub.email || owner?.email || "",
        phone: sub.phone || "",
      },
      rios: RIOS,
      property: {
        address: sub.property_address || property?.address || "",
        unit: sub.property_unit || "",
        condominium: sub.property_condominium || "",
        city_uf: sub.property_city_uf || "",
        max_guests: sub.property_max_guests || property?.max_guests || "",
        parking_spots: sub.property_parking_spots ?? "",
      },
      contract: {
        commission_percent: contract.commission_percent,
        term_months: contract.term_months,
        start_date: contract.start_date
          ? new Date(contract.start_date + "T00:00:00").toLocaleDateString("pt-BR")
          : "",
        specific_terms: contract.specific_terms || "—",
        maintenance_limit_brl: formatBRL(contract.maintenance_limit_cents),
        location: "Cabo Frio/RJ",
        date: new Date().toLocaleDateString("pt-BR"),
      },
    };
    return markdownToHtml(fillTemplate(templateMd, data));
  }, [templateMd, contract, owner, property, submission]);

  return (
    <div className="contract-doc">
      <style>{`
        .contract-doc { background:hsl(var(--background)); color:hsl(var(--foreground)); padding: 48px; max-width: 820px; margin: 0 auto; font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; font-size: 14px; }
        .contract-doc .contract-h1 { font-size: 22px; font-weight: 700; margin: 24px 0 16px; letter-spacing: -0.01em; border-bottom: 2px solid hsl(var(--border)); padding-bottom: 12px; }
        .contract-doc .contract-h2 { display:flex; align-items:center; gap: 12px; font-size: 16px; font-weight: 600; margin: 28px 0 12px; }
        .contract-doc .contract-chip { display:inline-flex; align-items:center; justify-content:center; width: 32px; height: 32px; border-radius: 999px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 13px; font-weight: 700; }
        .contract-doc p { margin: 8px 0; }
        .contract-doc .contract-italic { font-style: italic; color: hsl(var(--muted-foreground)); }
        .contract-doc .contract-list { padding-left: 20px; margin: 8px 0; }
        .contract-doc .contract-quote { border-left: 3px solid hsl(var(--warning, var(--primary))); padding: 8px 12px; background: hsl(var(--muted)); margin: 12px 0; border-radius: 6px; }
        .contract-doc strong { font-weight: 600; }
        @media print {
          .contract-doc { padding: 24mm 16mm; max-width: none; }
        }
      `}</style>
      <header className="border-b pb-4 mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">RIOS Gestão de Imóveis por Temporada</p>
        <p className="text-xs text-muted-foreground mt-1">Documento contratual · {new Date().toLocaleDateString("pt-BR")}</p>
      </header>
      <article dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="mt-12 pt-8 border-t grid grid-cols-2 gap-8">
        <div>
          <div className="border-t border-foreground/40 pt-2 text-xs text-muted-foreground">PROPRIETÁRIO/CONTRATANTE</div>
        </div>
        <div>
          <div className="border-t border-foreground/40 pt-2 text-xs text-muted-foreground">RIOS/CONTRATADA</div>
        </div>
      </footer>
    </div>
  );
}
