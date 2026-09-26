import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, ClipboardCheck, Ticket, Sparkles, PlayCircle } from "lucide-react";
import { AlertBanner } from "@/components/AlertBanner";
import { PropostasPendentesCompletas } from "@/components/PropostasPendentesCompletas";
import { supabase } from "@/integrations/supabase/client";
import { OwnerPropertiesSection } from "@/components/OwnerPropertiesSection";
import { OwnerScoreDisplay } from "@/components/OwnerScoreDisplay";
import { MaintenanceKanbanPreview } from "@/components/MaintenanceKanbanPreview";
import { OwnerMaintenanceProgress } from "@/components/OwnerMaintenanceProgress";
import { OwnerTicketsPreview } from "@/components/OwnerTicketsPreview";
import { OwnerChargesPreview } from "@/components/OwnerChargesPreview";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { OwnerOnboardingTour } from "@/components/OwnerOnboardingTour";
import { OwnerBookingCommissionsPreview } from "@/components/OwnerBookingCommissionsPreview";
import { OwnerContractInviteCard } from "@/components/contracts/OwnerContractInviteCard";
import { OwnerCuradoriaBanner } from "@/components/OwnerCuradoriaBanner";
import { PainelHeader, type AcaoHeader } from "@/components/painel/PainelHeader";
import { PainelHero } from "@/components/painel/PainelHero";
import { OwnerResumo } from "@/components/painel/OwnerResumo";
import { OwnerAjuda } from "@/components/painel/OwnerAjuda";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function MinhaCaixa() {
  useScrollRestoration();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [hasInspectionAccess, setHasInspectionAccess] = useState(false);

  const isOwner = profile?.role === "owner";
  const isTeam = profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent";

  useEffect(() => {
    const checkInspectionAccess = async () => {
      if (!user) return;

      try {
        // Buscar propriedades do usuário
        const { data: properties, error: propError } = await supabase
          .from("properties")
          .select("id")
          .eq("owner_id", user.id)
          .is("archived_at", null);

        if (propError) throw propError;

        if (!properties || properties.length === 0) {
          setHasInspectionAccess(false);
          return;
        }

        // Verificar se alguma propriedade tem acesso ao portal habilitado
        const { data: settings, error: settingsError } = await supabase
          .from("inspection_settings")
          .select("owner_portal_enabled")
          .in(
            "property_id",
            properties.map((p) => p.id),
          )
          .eq("owner_portal_enabled", true);

        if (settingsError) throw settingsError;

        setHasInspectionAccess(!!settings && settings.length > 0);
      } catch (error) {
        console.error("Error checking inspection access:", error);
        setHasInspectionAccess(false);
      }
    };

    checkInspectionAccess();
  }, [user]);

  const maisAcoes: AcaoHeader[] = [
    { rotulo: "Minhas cobranças", icone: <DollarSign />, onClick: () => navigate("/minhas-cobrancas") },
    { rotulo: "Meus chamados", icone: <Ticket />, onClick: () => navigate("/meus-chamados") },
    { rotulo: "Minha curadoria", icone: <Sparkles />, onClick: () => navigate("/minha-curadoria") },
  ];
  if (hasInspectionAccess) {
    maisAcoes.push({ rotulo: "Vistorias", icone: <ClipboardCheck />, onClick: () => navigate("/vistorias") });
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background pb-24 md:pb-10">
      {/* Faixa suave no topo, atrás do cabeçalho e da saudação */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent"
      />

      <PainelHeader
        inicio="/minha-caixa"
        acaoPrincipal={{ rotulo: "Novo chamado", icone: <Plus />, onClick: () => navigate("/novo-ticket") }}
        maisAcoes={maisAcoes}
        extrasPerfil={
          isOwner ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                localStorage.removeItem("owner_onboarding_v1_done");
                window.location.reload();
              }}
            >
              <PlayCircle className="h-4 w-4" />
              Ver tour de boas-vindas
            </Button>
          ) : undefined
        }
      />

      <main className="container relative mx-auto flex flex-col gap-7 px-4 py-6 md:gap-8 md:py-8">
        <PainelHero nome={profile?.name} subtitulo="Seus imóveis, cobranças e chamados em um lugar só." />

        {/* 1. Números — cada um leva à tela correspondente */}
        {isOwner && <OwnerResumo />}

        {/* 2. Avisos da equipe (só aparecem quando existem) */}
        <AlertBanner />

        {/* 3. O que pede uma decisão: curadoria, contrato, propostas */}
        <OwnerCuradoriaBanner />
        <OwnerContractInviteCard />
        <PropostasPendentesCompletas />

        {/* Kanban de Manutenções - visível para equipe */}
        {isTeam && <MaintenanceKanbanPreview />}

        {/* 4. Imóveis — o ponto de partida para chamado, vistoria e relatório por unidade (o título vem junto) */}
        {isOwner && <OwnerPropertiesSection />}

        {/* 5. Acompanhamento: cobranças e chamados à esquerda; score e guias à direita */}
        {isOwner && (
          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <OwnerChargesPreview />
              <OwnerBookingCommissionsPreview />
              <OwnerMaintenanceProgress />
              <OwnerTicketsPreview />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <div id="score-pagamentos" className="scroll-mt-20">
                <OwnerScoreDisplay />
              </div>
              <OwnerAjuda />
            </div>
          </div>
        )}
      </main>

      <MobileBottomNav />
      {isOwner && <OwnerOnboardingTour />}
    </div>
  );
}
