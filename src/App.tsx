import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SessionHandlerWrapper } from "@/components/SessionHandlerWrapper";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import AguardandoAprovacao from "./pages/AguardandoAprovacao";
import MinhaCaixa from "./pages/MinhaCaixa";
import MinhasCobrancas from "./pages/MinhasCobrancas";
import NovoTicket from "./pages/NovoTicket";
import Painel from "./pages/Painel";
import Aprovacoes from "./pages/Aprovacoes";
import AdminCadastrarProprietario from "./pages/AdminCadastrarProprietario";
import AdminCadastrarFaxineira from "./pages/AdminCadastrarFaxineira";
import AdminCadastrarEquipe from "./pages/AdminCadastrarEquipe";
import AdminGerenciarUsuarios from "./pages/AdminGerenciarUsuarios";
import NotFound from "./pages/NotFound";
import TicketDetalhes from "./pages/TicketDetalhes";
import NovaCobranca from "./pages/NovaCobranca";
import TodosTickets from "./pages/TodosTickets";
import Propriedades from "./pages/Propriedades";
import GerenciarCobrancas from "./pages/GerenciarCobrancas";
import CobrancaDetalhes from "./pages/CobrancaDetalhes";
import MigrarAnexos from "./pages/MigrarAnexos";
import NovoAlerta from "./pages/NovoAlerta";
import NovoTicketMassa from "./pages/NovoTicketMassa";
import ConfiguracaoEmail from "./pages/ConfiguracaoEmail";
import ConfiguracaoIA from "./pages/ConfiguracaoIA";
import RegrasCobrancas from "./pages/RegrasCobrancas";
import Manutencoes from "./pages/Manutencoes";
import ManutencaoDetalhes from "./pages/ManutencaoDetalhes";
import Faxineira from "./pages/Faxineira";
import AdminVistorias from "./pages/AdminVistorias";
import AdminVistoriasImovel from "./pages/AdminVistoriasImovel";
import AdminVistoriaDetalhes from "./pages/AdminVistoriaDetalhes";
import AdminVistoriasTodas from "./pages/AdminVistoriasTodas";
import AdminVistoriasConfiguracoes from "./pages/AdminVistoriasConfiguracoes";
import Vistorias from "./pages/Vistorias";
import VistoriaDetalhes from "./pages/VistoriaDetalhes";
import Votacoes from "./pages/Votacoes";
import NovaPropostaVotacao from "./pages/NovaPropostaVotacao";
import VotacaoDetalhes from "./pages/VotacaoDetalhes";
import NovoTicketInterno from "./pages/NovoTicketInterno";
import MeusChamados from "./pages/MeusChamados";
import AdminProfissionais from "./pages/AdminProfissionais";
import AdminManutencoesKanban from "./pages/AdminManutencoesKanban";
import NovaManutencao from "./pages/NovaManutencao";
import AdminManutencoesConluidas from "./pages/AdminManutencoesConluidas";
import AdminChamadosKanban from "./pages/AdminChamadosKanban";
import AdminManutencoesLista from "./pages/AdminManutencoesLista";
import HistoricoComunicacao from "./pages/HistoricoComunicacao";
import ResumoPropriedades from "./pages/ResumoPropriedades";
import ResumoDiario from "./pages/ResumoDiario";
import ProtocoloTrabalho from "./pages/ProtocoloTrabalho";
import DebugApp from "./pages/DebugApp";
import Tutoriais from "./pages/Tutoriais";
import CalendarioReservas from "./pages/CalendarioReservas";
import AdminRelatorioCobrancas from "./pages/AdminRelatorioCobrancas";
import RotinaProfissional from "./pages/RotinaProfissional";
import BookingComissoes from "./pages/BookingComissoes";
import NovaComissaoBooking from "./pages/NovaComissaoBooking";
import ComissaoBookingDetalhes from "./pages/ComissaoBookingDetalhes";
import AdminRelatorioBooking from "./pages/AdminRelatorioBooking";
import ImportarComissoesBooking from "./pages/ImportarComissoesBooking";
import MinhasComissoesBooking from "./pages/MinhasComissoesBooking";
import MinhaComissaoBookingDetalhes from "./pages/MinhaComissaoBookingDetalhes";
import AdminManutencoesArquivo from "./pages/AdminManutencoesArquivo";
import AdminBloqueiosDatas from "./pages/AdminBloqueiosDatas";
import RelatorioFinanceiro from "./pages/RelatorioFinanceiro";
import OwnerRelatorioFinanceiro from "./pages/OwnerRelatorioFinanceiro";
import RelatoriosPropriedade from "./pages/RelatoriosPropriedade";
import AdminFichasImoveis from "./pages/AdminFichasImoveis";
import AdminRelatoriosFinanceiros from "./pages/AdminRelatoriosFinanceiros";
import AdminRelatoriosProprietario from "./pages/AdminRelatoriosProprietario";
import CadastroImovel from "./pages/CadastroImovel";
import AdminCadastrosProprietarios from "./pages/AdminCadastrosProprietarios";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SessionHandlerWrapper>
          <Routes>
            <Route index element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
            <Route
              path="/minha-caixa"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <MinhaCaixa />
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
            <Route
              path="/calendario-reservas"
              element={
                <ProtectedRoute allowedRoles={['admin', 'maintenance', 'agent']}>
                  <CalendarioReservas />
                </ProtectedRoute>
              }
            />
            
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
              path="/admin/relatorios-financeiros/:ownerId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'agent', 'maintenance']}>
                  <AdminRelatoriosProprietario />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </SessionHandlerWrapper>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
