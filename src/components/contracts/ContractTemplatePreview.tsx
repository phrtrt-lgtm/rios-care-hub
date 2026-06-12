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
    <div className="flex justify-center">
      <div className="contract-doc">
        <style>{`
          .contract-doc {
            background: hsl(var(--card));
            color: hsl(var(--card-foreground));
            padding: 64px 56px;
            max-width: 794px;
            width: 100%;
            min-height: 1123px;
            margin: 0 auto;
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.7;
            font-size: 13px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
            border-radius: 4px;
            position: relative;
          }
          .contract-doc::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 4px;
            background: hsl(var(--primary));
            border-radius: 4px 4px 0 0;
          }
          .contract-doc .contract-header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 1px solid hsl(var(--border));
          }
          .contract-doc .contract-header h1 {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: hsl(var(--primary));
            margin-bottom: 8px;
          }
          .contract-doc .contract-header p {
            font-size: 11px;
            color: hsl(var(--muted-foreground));
            margin: 0;
          }
          .contract-doc .contract-h1 {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 18px;
            font-weight: 700;
            margin: 32px 0 16px;
            letter-spacing: -0.01em;
            color: hsl(var(--foreground));
            border-bottom: 2px solid hsl(var(--primary) / 0.3);
            padding-bottom: 8px;
          }
          .contract-doc .contract-h2 {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            font-weight: 600;
            margin: 24px 0 10px;
            color: hsl(var(--foreground));
          }
          .contract-doc .contract-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            border-radius: 999px;
            background: hsl(var(--primary) / 0.12);
            color: hsl(var(--primary));
            font-size: 11px;
            font-weight: 700;
            flex-shrink: 0;
          }
          .contract-doc p {
            margin: 10px 0;
            text-align: justify;
            text-align-last: left;
          }
          .contract-doc .contract-italic {
            font-style: italic;
            color: hsl(var(--muted-foreground));
            text-align: center;
            margin: 16px 0;
          }
          .contract-doc .contract-list {
            padding-left: 24px;
            margin: 10px 0;
          }
          .contract-doc .contract-list li {
            margin: 6px 0;
          }
          .contract-doc .contract-quote {
            border-left: 3px solid hsl(var(--primary) / 0.4);
            padding: 10px 14px;
            background: hsl(var(--muted) / 0.5);
            margin: 14px 0;
            border-radius: 0 6px 6px 0;
            font-size: 12px;
          }
          .contract-doc strong {
            font-weight: 600;
            color: hsl(var(--foreground));
          }
          .contract-doc .contract-footer {
            margin-top: 60px;
            padding-top: 24px;
            border-top: 1px solid hsl(var(--border));
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 48px;
          }
          .contract-doc .contract-footer .signature-line {
            border-top: 1px solid hsl(var(--foreground) / 0.4);
            padding-top: 8px;
            margin-top: 48px;
            font-size: 11px;
            color: hsl(var(--muted-foreground));
            text-align: center;
          }
          @media print {
            .contract-doc {
              box-shadow: none;
              border-radius: 0;
              padding: 20mm 16mm;
              max-width: none;
              min-height: auto;
            }
            .contract-doc::before { display: none; }
          }
        `}</style>
        <div className="contract-header">
          <h1>RIOS Gestão de Imóveis por Temporada</h1>
          <p>Documento contratual &nbsp;·&nbsp; {new Date().toLocaleDateString("pt-BR")}</p>
        </div>
        <article dangerouslySetInnerHTML={{ __html: html }} />
        <div className="contract-footer">
          <div>
            <div className="signature-line">PROPRIETÁRIO / CONTRATANTE</div>
          </div>
          <div>
            <div className="signature-line">RIOS HOSPEDAGENS / CONTRATADA</div>
          </div>
        </div>
      </div>
    </div>
  );
}
