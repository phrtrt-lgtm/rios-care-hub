import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Mail, Phone, Calendar, ChevronRight, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PropertyReportsList } from "@/components/report/PropertyReportsList";

interface OwnerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  created_at: string;
}

interface PropertyItem {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
}

export default function AdminRelatoriosProprietario() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const { profile: currentProfile } = useAuth();
  const navigate = useNavigate();
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = currentProfile?.role === "admin";

  useEffect(() => {
    const fetchData = async () => {
      if (!ownerId) return;

      try {
        const [{ data: profileData, error: profileError }, { data: propsData, error: propsError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id, name, email, phone, photo_url, created_at")
              .eq("id", ownerId)
              .single(),
            supabase
              .from("properties")
              .select("id, name, address, cover_photo_url")
              .eq("owner_id", ownerId)
              .is("archived_at", null)
              .order("name"),
          ]);

        if (profileError) throw profileError;
        if (propsError) throw propsError;

        setOwner(profileData as OwnerProfile);
        setProperties((propsData as PropertyItem[]) || []);
      } catch (err) {
        console.error("Error loading owner data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ownerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="container mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Proprietário não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/admin/relatorios-financeiros")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/relatorios-financeiros")}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <nav className="flex items-center gap-1.5 text-sm min-w-0">
              <button
                onClick={() => navigate("/admin/relatorios-financeiros")}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                Relatórios Financeiros
              </button>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold truncate">{owner.name}</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Owner card */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              {owner.photo_url ? (
                <img
                  src={owner.photo_url}
                  alt={owner.name}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl sm:text-2xl font-semibold text-primary">
                    {owner.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-1">
                <h2 className="text-lg sm:text-xl font-bold truncate">{owner.name}</h2>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{owner.email}</span>
                  </span>
                  {owner.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      {owner.phone}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    {properties.length}{" "}
                    {properties.length === 1 ? "imóvel" : "imóveis"}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    Cadastrado em{" "}
                    {format(new Date(owner.created_at), "MMM 'de' yyyy", { locale: ptBR })}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Properties + reports */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Imóveis e Relatórios
          </h3>

          {properties.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="Nenhum imóvel cadastrado"
              description="Este proprietário ainda não tem imóveis ativos no sistema."
            />
          ) : (
            <div className="space-y-4">
              {properties.map((property) => (
                <Card key={property.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      {property.cover_photo_url ? (
                        <img
                          src={property.cover_photo_url}
                          alt={property.name}
                          className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{property.name}</CardTitle>
                        {property.address && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {property.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PropertyReportsList
                      propertyId={property.id}
                      showAdminActions={isAdmin}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
