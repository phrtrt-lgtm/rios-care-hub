import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoadingScreen } from "@/components/LoadingScreen";
import { lazyPage } from "@/lib/lazyPage";
import { SessionHandlerWrapper } from "@/components/SessionHandlerWrapper";
import Index from "./pages/Index";
import Login from "./pages/Login";
const Cadastro = lazyPage(() => import("./pages/Cadastro"));
const AguardandoAprovacao = lazyPage(() => import("./pages/AguardandoAprovacao"));
import MinhaCaixa from "./pages/MinhaCaixa";
const MinhasCobrancas = lazyPage(() => import("./pages/MinhasCobrancas"));
const NovoTicket = lazyPage(() => import("./pages/NovoTicket"));
const Painel = lazyPage(() => import("./pages/Painel"));
const Aprovacoes = lazyPage(() => import("./pages/Aprovacoes"));
const AdminCadastrarProprietario = lazyPage(() => import("./pages/AdminCadastrarProprietario"));
const AdminCadastrarFaxineira = lazyPage(() => import("./pages/AdminCadastrarFaxineira"));
const AdminCadastrarEquipe = lazyPage(() => import("./pages/AdminCadastrarEquipe"));
const AdminGerenciarUsuarios = lazyPage(() => import("./pages/AdminGerenciarUsuarios"));
import NotFound from "./pages/NotFound";
const TicketDetalhes = lazyPage(() => import("./pages/TicketDetalhes"));
const NovaCobranca = lazyPage(() => import("./pages/NovaCobranca"));
const TodosTickets = lazyPage(() => import("./pages/TodosTickets"));
const Propriedades = lazyPage(() => import("./pages/Propriedades"));
const GerenciarCobrancas = lazyPage(() => import("./pages/GerenciarCobrancas"));
const CobrancasHospedeArquivadas = lazyPage(() => import("./pages/CobrancasHospedeArquivadas"));
const CobrancaDetalhes = lazyPage(() => import("./pages/CobrancaDetalhes"));
const MigrarAnexos = lazyPage(() => import("./pages/MigrarAnexos"));
const NovoAlerta = lazyPage(() => import("./pages/NovoAlerta"));
const NovoTicketMassa = lazyPage(() => import("./pages/NovoTicketMassa"));
const ConfiguracaoEmail = lazyPage(() => import("./pages/ConfiguracaoEmail"));
const ConfiguracaoIA = lazyPage(() => import("./pages/ConfiguracaoIA"));
const RegrasCobrancas = lazyPage(() => import("./pages/RegrasCobrancas"));
const Manutencoes = lazyPage(() => import("./pages/Manutencoes"));
const ManutencaoDetalhes = lazyPage(() => import("./pages/ManutencaoDetalhes"));
const Faxineira = lazyPage(() => import("./pages/Faxineira"));
const AdminVistorias = lazyPage(() => import("./pages/AdminVistorias"));
const AdminVistoriasImovel = lazyPage(() => import("./pages/AdminVistoriasImovel"));
const AdminVistoriaDetalhes = lazyPage(() => import("./pages/AdminVistoriaDetalhes"));
const AdminVistoriasTodas = lazyPage(() => import("./pages/AdminVistoriasTodas"));
const AdminVistoriasRotina = lazyPage(() => import("./pages/AdminVistoriasRotina"));
const AdminVistoriasConfiguracoes = lazyPage(() => import("./pages/AdminVistoriasConfiguracoes"));
const Vistorias = lazyPage(() => import("./pages/Vistorias"));
const VistoriaDetalhes = lazyPage(() => import("./pages/VistoriaDetalhes"));
const Votacoes = lazyPage(() => import("./pages/Votacoes"));
const NovaPropostaVotacao = lazyPage(() => import("./pages/NovaPropostaVotacao"));
const VotacaoDetalhes = lazyPage(() => import("./pages/VotacaoDetalhes"));
const NovoTicketInterno = lazyPage(() => import("./pages/NovoTicketInterno"));
const MeusChamados = lazyPage(() => import("./pages/MeusChamados"));
const AdminProfissionais = lazyPage(() => import("./pages/AdminProfissionais"));
const AdminManutencoesKanban = lazyPage(() => import("./pages/AdminManutencoesKanban"));
const NovaManutencao = lazyPage(() => import("./pages/NovaManutencao"));
const AdminManutencoesConluidas = lazyPage(() => import("./pages/AdminManutencoesConluidas"));
const AdminChamadosKanban = lazyPage(() => import("./pages/AdminChamadosKanban"));
const AdminManutencoesLista = lazyPage(() => import("./pages/AdminManutencoesLista"));
const HistoricoComunicacao = lazyPage(() => import("./pages/HistoricoComunicacao"));
const ResumoPropriedades = lazyPage(() => import("./pages/ResumoPropriedades"));
const ResumoDiario = lazyPage(() => import("./pages/ResumoDiario"));
const ProtocoloTrabalho = lazyPage(() => import("./pages/ProtocoloTrabalho"));
const DebugApp = lazyPage(() => import("./pages/DebugApp"));
const Tutoriais = lazyPage(() => import("./pages/Tutoriais"));

const AdminRelatorioCobrancas = lazyPage(() => import("./pages/AdminRelatorioCobrancas"));
const RotinaProfissional = lazyPage(() => import("./pages/RotinaProfissional"));
const BookingComissoes = lazyPage(() => import("./pages/BookingComissoes"));
const NovaComissaoBooking = lazyPage(() => import("./pages/NovaComissaoBooking"));
const ComissaoBookingDetalhes = lazyPage(() => import("./pages/ComissaoBookingDetalhes"));
const AdminRelatorioBooking = lazyPage(() => import("./pages/AdminRelatorioBooking"));
const ImportarComissoesBooking = lazyPage(() => import("./pages/ImportarComissoesBooking"));
const MinhasComissoesBooking = lazyPage(() => import("./pages/MinhasComissoesBooking"));
const MinhaComissaoBookingDetalhes = lazyPage(() => import("./pages/MinhaComissaoBookingDetalhes"));
const AdminManutencoesArquivo = lazyPage(() => import("./pages/AdminManutencoesArquivo"));
const AdminBloqueiosDatas = lazyPage(() => import("./pages/AdminBloqueiosDatas"));
const RelatorioFinanceiro = lazyPage(() => import("./pages/RelatorioFinanceiro"));
const OwnerRelatorioFinanceiro = lazyPage(() => import("./pages/OwnerRelatorioFinanceiro"));
const RelatoriosPropriedade = lazyPage(() => import("./pages/RelatoriosPropriedade"));
const AdminFichasImoveis = lazyPage(() => import("./pages/AdminFichasImoveis"));
const AdminRelatoriosFinanceiros = lazyPage(() => import("./pages/AdminRelatoriosFinanceiros"));
const AdminComissaoRios = lazyPage(() => import("./pages/AdminComissaoRios"));
const AdminCentralHostex = lazyPage(() => import("./pages/AdminCentralHostex"));
const AdminRelatoriosProprietario = lazyPage(() => import("./pages/AdminRelatoriosProprietario"));
const AdminRelatoriosManutencoes = lazyPage(() => import("./pages/AdminRelatoriosManutencoes"));
const AdminRelatorioManutencoesProprietario = lazyPage(() => import("./pages/AdminRelatorioManutencoesProprietario"));
const CadastroImovel = lazyPage(() => import("./pages/CadastroImovel"));
const CadastroObrigado = lazyPage(() => import("./pages/CadastroObrigado"));
const AdminCadastrosProprietarios = lazyPage(() => import("./pages/AdminCadastrosProprietarios"));
const AtualizacaoAnuncio = lazyPage(() => import("./pages/AtualizacaoAnuncio"));
const AdminVistoriasArquivadas = lazyPage(() => import("./pages/AdminVistoriasArquivadas"));
const BemVindo = lazyPage(() => import("./pages/BemVindo"));
const AdminCuradoriaNova = lazyPage(() => import("./pages/AdminCuradoriaNova"));
const AdminCuradoriasLista = lazyPage(() => import("./pages/AdminCuradoriasLista"));
const DefinirSenha = lazyPage(() => import("./pages/DefinirSenha"));
const MinhaCuradoria = lazyPage(() => import("./pages/MinhaCuradoria"));
const CuradoriaPublica = lazyPage(() => import("./pages/CuradoriaPublica"));
const AdminContratos = lazyPage(() => import("./pages/AdminContratos"));
const AdminContratoNovo = lazyPage(() => import("./pages/AdminContratoNovo"));
const AdminContratoDetalhes = lazyPage(() => import("./pages/AdminContratoDetalhes"));

const ContratoProprietario = lazyPage(() => import("./pages/ContratoProprietario"));
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SessionHandlerWrapper>
          <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route index element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/cadastro-imovel" element={<CadastroImovel />} />
            <Route path="/cadastro-imovel/obrigado" element={<CadastroObrigado />} />
            <Route
              path="/atualizacao-anuncio"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <AtualizacaoAnuncio />
                </ProtectedRoute>
              }
            />
            <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
            <Route path="/bem-vindo" element={<BemVindo />} />
            <Route path="/curadoria/p/:id" element={<CuradoriaPublica />} />
            <Route path="/definir-senha" element={<DefinirSenha />} />
            <Route
              path="/minha-caixa"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhaCaixa />
                </ProtectedRoute>
              }
            />
            <Route
              path="/minha-curadoria"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhaCuradoria />
                </ProtectedRoute>
              }
            />
            <Route
              path="/minhas-cobrancas"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhasCobrancas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/novo-ticket"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <NovoTicket />
                </ProtectedRoute>
              }
            />
            <Route
              path="/meus-chamados"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MeusChamados />
                </ProtectedRoute>
              }
            />
            <Route
              path="/painel"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <Painel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aprovacoes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Aprovacoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cadastrar-proprietario"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCadastrarProprietario />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cadastrar-faxineira"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCadastrarFaxineira />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cadastrar-equipe"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCadastrarEquipe />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/gerenciar-usuarios"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminGerenciarUsuarios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/curadoria/nova"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent']}>
                  <AdminCuradoriaNova />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/curadorias"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent']}>
                  <AdminCuradoriasLista />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticket-detalhes/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <TicketDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nova-cobranca"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <NovaCobranca />
                </ProtectedRoute>
              }
            />
            <Route
              path="/todos-tickets"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <TodosTickets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/propriedades"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <Propriedades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gerenciar-cobrancas"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <GerenciarCobrancas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cobrancas-hospede-arquivadas"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <CobrancasHospedeArquivadas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cobranca/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <CobrancaDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/migrar-anexos"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <MigrarAnexos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/novo-alerta"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <NovoAlerta />
                </ProtectedRoute>
              }
            />
            <Route
              path="/novo-ticket-massa"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <NovoTicketMassa />
                </ProtectedRoute>
              }
            />
            <Route path="/configuracao-email" element={<ProtectedRoute allowedRoles={["admin"]}><ConfiguracaoEmail /></ProtectedRoute>} />
            <Route path="/configuracao-ia" element={<ProtectedRoute allowedRoles={["admin"]}><ConfiguracaoIA /></ProtectedRoute>} />
            <Route path="/regras-cobrancas" element={<ProtectedRoute allowedRoles={["admin"]}><RegrasCobrancas /></ProtectedRoute>} />
            <Route path="/protocolo-trabalho" element={<ProtectedRoute allowedRoles={["owner", "agent", "admin", "maintenance", "cleaner"]}><ProtocoloTrabalho /></ProtectedRoute>} />
            <Route
              path="/manutencoes"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <Manutencoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manutencao/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <ManutencaoDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faxineira"
              element={
                <ProtectedRoute allowedRoles={['cleaner', 'agent', 'admin', 'maintenance']}>
                  <Faxineira />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistorias"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminVistorias />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistorias/:id"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminVistoriasImovel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistoria/:inspectionId"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminVistoriaDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistorias/todas"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminVistoriasTodas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistorias/rotina"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminVistoriasRotina />
                </ProtectedRoute>
              }
            />
            <Route

              path="/admin/vistorias/configuracoes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminVistoriasConfiguracoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vistorias"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <Vistorias />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vistoria/:id"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <VistoriaDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/votacoes"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <Votacoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nova-proposta-votacao"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <NovaPropostaVotacao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/votacao-detalhes/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <VotacaoDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/novo-ticket-interno"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <NovoTicketInterno />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profissionais"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <AdminProfissionais />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manutencoes"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <AdminManutencoesKanban />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/nova-manutencao"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <NovaManutencao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manutencoes-concluidas"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <AdminManutencoesConluidas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chamados"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance', 'agent']}>
                  <AdminChamadosKanban />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manutencoes-lista"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <AdminManutencoesLista />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manutencoes-arquivo"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance']}>
                  <AdminManutencoesArquivo />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/vistorias/arquivadas"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminVistoriasArquivadas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/historico-comunicacao/:ownerId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
              <HistoricoComunicacao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/resumo-propriedades"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <ResumoPropriedades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/resumo-diario"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <ResumoDiario />
                </ProtectedRoute>
              }
            />
            <Route path="/calendario-reservas" element={<Navigate to="/admin/central-hostex" replace />} />
            
            <Route
              path="/admin/relatorio-cobrancas"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatorioCobrancas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rotina-profissional"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <RotinaProfissional />
                </ProtectedRoute>
              }
            />
            <Route path="/debug-app" element={<DebugApp />} />
            <Route
              path="/tutoriais"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <Tutoriais />
                </ProtectedRoute>
              }
            />
            {/* Booking Comissões */}
            <Route
              path="/booking-comissoes"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <BookingComissoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nova-comissao-booking"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <NovaComissaoBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/comissao-booking/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <ComissaoBookingDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorio-booking"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <AdminRelatorioBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/importar-comissoes-booking"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin', 'maintenance']}>
                  <ImportarComissoesBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/minhas-comissoes-booking"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhasComissoesBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/minha-comissao-booking/:id"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhaComissaoBookingDetalhes />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route
              path="/admin/bloqueios-datas"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminBloqueiosDatas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorio-financeiro"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <RelatorioFinanceiro />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorio-financeiro/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <OwnerRelatorioFinanceiro />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios-propriedade/:propertyId"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin', 'maintenance']}>
                  <RelatoriosPropriedade />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/fichas-imoveis"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminFichasImoveis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios-financeiros"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatoriosFinanceiros />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/comissao-rios"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminComissaoRios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/central-hostex"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCentralHostex />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios-financeiros/:ownerId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatoriosProprietario />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios-manutencoes"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatoriosManutencoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios-manutencoes/:ownerId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatorioManutencoesProprietario />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cadastros-proprietarios"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent']}>
                  <AdminCadastrosProprietarios />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/contratos" element={<ProtectedRoute allowedRoles={['admin']}><AdminContratos /></ProtectedRoute>} />
            <Route path="/admin/contratos/novo" element={<ProtectedRoute allowedRoles={['admin']}><AdminContratoNovo /></ProtectedRoute>} />
            <Route path="/admin/contratos/:id" element={<ProtectedRoute allowedRoles={['admin']}><AdminContratoDetalhes /></ProtectedRoute>} />
            
            <Route path="/contrato/:id" element={<ProtectedRoute allowedRoles={['owner']}><ContratoProprietario /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </SessionHandlerWrapper>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
