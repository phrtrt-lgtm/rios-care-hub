import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ClipboardList, FileText, List, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/AlertBanner";
import { VotacoesPendentes } from "@/components/VotacoesPendentes";
import { MaintenanceKanbanPreview } from "@/components/MaintenanceKanbanPreview";
import { ChamadosKanbanPreview } from "@/components/ChamadosKanbanPreview";
import { VistoriasKanbanPreview } from "@/components/VistoriasKanbanPreview";
import { ChargesKanbanPreview } from "@/components/ChargesKanbanPreview";
import { GuestChargeReminders } from "@/components/GuestChargeReminders";
import { TeamChatWidget } from "@/components/TeamChatWidget";
import { GlobalSearch, useGlobalSearch } from "@/components/GlobalSearch";
import { EnablePushNative } from "@/components/EnablePushNative";
import { AIConsultaWidget } from "@/components/AIConsultaWidget";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PainelHeader, type AcaoHeader } from "@/components/painel/PainelHeader";
import { PainelHero } from "@/components/painel/PainelHero";
import { PainelResumo } from "@/components/painel/PainelResumo";
import { PainelAtalhos } from "@/components/painel/PainelAtalhos";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { DetailSheet } from "@/components/detail-sheet/DetailSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function Painel() {
  useScrollRestoration();
  const { profile } = useAuth();
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch();
  const navigate = useNavigate();

  // Save scroll position when leaving, restore when returning
  useEffect(() => {
    const saved = sessionStorage.getItem("painel_scroll");
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
        sessionStorage.removeItem("painel_scroll");
      });
    }
    // Save scroll on unmount (SPA navigation)
    return () => {
      sessionStorage.setItem("painel_scroll", String(window.scrollY));
    };
  }, []);

  const papel = profile?.role;
  const isAdmin = papel === "admin";
  const isTeam = papel === "admin" || papel === "agent" || papel === "maintenance";

  const {
    open: detailSheetOpen,
    entityId: detailEntityId,
    entityType: detailEntityType,
    openSheet,
    closeSheet,
  } = useDetailSheet();

  const [lembreteHospedeAberto, setLembreteHospedeAberto] = useState(false);
  const abrirLembreteHospede = useCallback(() => {
    setLembreteHospedeAberto(true);
    requestAnimationFrame(() =>
      document.getElementById("lembrete-hospede")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, []);

  // Menu "Mais" do cabeçalho: as mesmas permissões de antes, agora numa lista.
  const maisAcoes: AcaoHeader[] = [];
  if (isAdmin || papel === "maintenance") {
    maisAcoes.push({ rotulo: "Vistorias de faxina", icone: <Sparkles />, onClick: () => navigate("/admin/vistorias") });
  }
  if (isTeam) {
    maisAcoes.push({
      rotulo: "Vistorias de rotina",
      icone: <ClipboardList />,
      onClick: () => navigate("/admin/vistorias/rotina"),
    });
    maisAcoes.push({
      rotulo: "Resumo por propriedade",
      icone: <Building2 />,
      onClick: () => navigate("/resumo-propriedades"),
    });
  }
  if (isAdmin || papel === "maintenance") {
    maisAcoes.push({
      rotulo: "Lista de manutenções",
      icone: <List />,
      onClick: () => navigate("/admin/manutencoes-lista"),
    });
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background pb-24 md:pb-10">
      {/* Faixa suave no topo, atrás do cabeçalho e da saudação */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-secondary/[0.07] via-secondary/[0.02] to-transparent"
      />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <TeamChatWidget />
      {isTeam && <AIConsultaWidget />}

      <PainelHeader
        inicio="/painel"
        acaoPrincipal={isTeam ? { rotulo: "Novo ticket", icone: <Plus />, onClick: () => navigate("/novo-ticket-massa") } : undefined}
        maisAcoes={maisAcoes}
        onBuscar={() => setSearchOpen(true)}
        mostrarCalendario={isTeam}
        extrasPerfil={
          <>
            <Button variant="outline" className="w-full" onClick={() => navigate("/debug-app")}>
              <FileText className="h-4 w-4" />
              Debug do app
            </Button>
            <EnablePushNative />
          </>
        }
      />

      <main className="container relative mx-auto flex flex-col gap-7 px-4 py-6 md:gap-8 md:py-8">
        <PainelHero nome={profile?.name} subtitulo="O que precisa de atenção hoje, em um lugar só." />

        {/* 1. Números do dia — cada um leva à tela correspondente */}
        {isTeam && <PainelResumo onAbrirHospede={abrirLembreteHospede} />}

        {/* 2. Avisos e votações (só aparecem quando existem) */}
        <AlertBanner />
        <VotacoesPendentes />

        {/* 3. Operações — o trabalho do dia */}
        {isTeam && (
          <section aria-labelledby="titulo-operacoes" className="flex min-w-0 flex-col gap-4">
            <TituloSecao id="titulo-operacoes" titulo="Operações" subtitulo="Manutenções, cobranças, chamados e vistorias" />
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              <MaintenanceKanbanPreview />
              <ChargesKanbanPreview />
              <ChamadosKanbanPreview />
              <VistoriasKanbanPreview />
            </div>
            {/* Lembrete compacto: uma linha fechado, lista completa aberto */}
            <GuestChargeReminders
              open={lembreteHospedeAberto}
              onOpenChange={setLembreteHospedeAberto}
              onOpenDetail={openSheet}
            />
          </section>
        )}

        {/* 4. Atalhos — tudo o que era espalhado em cinco seções */}
        {isTeam && (
          <section aria-labelledby="titulo-atalhos" className="flex min-w-0 flex-col gap-4">
            <TituloSecao id="titulo-atalhos" titulo="Atalhos" subtitulo="Criar, consultar e configurar" />
            <PainelAtalhos />
          </section>
        )}
      </main>

      {/* Itens do lembrete de hóspede abrem aqui, sem sair do painel */}
      <DetailSheet
        open={detailSheetOpen}
        onClose={closeSheet}
        entityId={detailEntityId}
        entityType={detailEntityType}
      />

      <MobileBottomNav />
    </div>
  );
}
