import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardCheck, Plus, MapPin, Wrench, CalendarX, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DateBlockRequestDialog } from "@/components/DateBlockRequestDialog";
import { propertiesScopeFilter } from "@/lib/ownerScope";
import { TituloSecao } from "@/components/painel/TituloSecao";

interface Property {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
  owner_portal_enabled: boolean;
}

const GRADE = "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export const OwnerPropertiesSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockDialogProperty, setBlockDialogProperty] = useState<Property | null>(null);

  useEffect(() => {
    const fetchProperties = async () => {
      if (!user) return;

      try {
        const { data: propertiesData, error: propError } = await supabase
          .from("properties")
          .select("id, name, address, cover_photo_url")
          .or(await propertiesScopeFilter(user.id))
          .is("archived_at", null)
          .order("name");

        if (propError) throw propError;

        if (!propertiesData || propertiesData.length === 0) {
          setProperties([]);
          setLoading(false);
          return;
        }

        const { data: settings, error: settingsError } = await supabase
          .from("inspection_settings")
          .select("property_id, owner_portal_enabled")
          .in(
            "property_id",
            propertiesData.map((p) => p.id),
          );

        if (settingsError) throw settingsError;

        const settingsMap = new Map((settings || []).map((s) => [s.property_id, s.owner_portal_enabled]));

        const propertiesWithSettings: Property[] = propertiesData.map((p) => ({
          ...p,
          owner_portal_enabled: settingsMap.get(p.id) || false,
        }));

        setProperties(propertiesWithSettings);
      } catch (error) {
        console.error("Error fetching properties:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, [user]);

  if (loading) {
    return (
      <div className={GRADE} aria-busy="true" aria-label="Carregando imóveis">
        {[1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-3 h-9 w-full" />
              <div className="grid grid-cols-2 gap-1.5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (properties.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="titulo-imoveis" className="flex min-w-0 flex-col gap-4 overflow-hidden">
      <TituloSecao
        id="titulo-imoveis"
        titulo="Meus imóveis"
        subtitulo="Chamados, vistorias, manutenções e relatórios por unidade"
      />
      <div className={GRADE}>
        {properties.map((property) => (
          <article
            key={property.id}
            className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {/* Foto com o nome por cima */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
              {property.cover_photo_url ? (
                <img
                  src={property.cover_photo_url}
                  alt={property.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary/10 to-primary/10">
                  <Building2 className="h-8 w-8 text-muted-foreground/70" />
                </div>
              )}
              <div
                className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-secondary/90 via-secondary/40 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 p-3 text-secondary-foreground">
                <h3 className="truncate text-sm font-semibold leading-tight md:text-[15px]">{property.name}</h3>
                {property.address && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-secondary-foreground/80">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{property.address}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <Button
                onClick={() => navigate(`/novo-ticket?property=${property.id}`)}
                className="h-9 w-full text-sm"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Novo chamado
              </Button>

              <div className="grid grid-cols-2 gap-1.5">
                {property.owner_portal_enabled && (
                  <AcaoImovel
                    icone={<ClipboardCheck />}
                    rotulo="Vistorias"
                    onClick={() => navigate(`/vistorias?property=${property.id}`)}
                  />
                )}
                <AcaoImovel
                  icone={<Wrench />}
                  rotulo="Manutenções"
                  onClick={() => navigate(`/manutencoes?property=${property.id}`)}
                />
                <AcaoImovel
                  icone={<FileText />}
                  rotulo="Relatórios"
                  onClick={() => navigate(`/relatorios-propriedade/${property.id}`)}
                />
                <AcaoImovel
                  icone={<CalendarX />}
                  rotulo="Bloqueio"
                  tracejada
                  onClick={() => setBlockDialogProperty(property)}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      {blockDialogProperty && (
        <DateBlockRequestDialog
          open={!!blockDialogProperty}
          onOpenChange={(open) => {
            if (!open) setBlockDialogProperty(null);
          }}
          propertyId={blockDialogProperty.id}
          propertyName={blockDialogProperty.name}
        />
      )}
    </section>
  );
};

function AcaoImovel({
  icone,
  rotulo,
  onClick,
  tracejada = false,
}: {
  icone: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  tracejada?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={`h-8 justify-start gap-1.5 px-2 text-xs font-medium [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-primary ${
        tracejada ? "border-dashed" : ""
      }`}
    >
      {icone}
      <span className="truncate">{rotulo}</span>
    </Button>
  );
}
