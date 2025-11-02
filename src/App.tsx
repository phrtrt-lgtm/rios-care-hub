import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
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
              path="/painel"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
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
              path="/ticket-detalhes/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin']}>
                  <TicketDetalhes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nova-cobranca"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <NovaCobranca />
                </ProtectedRoute>
              }
            />
            <Route
              path="/todos-tickets"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <TodosTickets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/propriedades"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <Propriedades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gerenciar-cobrancas"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <GerenciarCobrancas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cobranca/:id"
              element={
                <ProtectedRoute allowedRoles={['owner', 'agent', 'admin']}>
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
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <NovoAlerta />
                </ProtectedRoute>
              }
            />
            <Route
              path="/novo-ticket-massa"
              element={
                <ProtectedRoute allowedRoles={['agent', 'admin']}>
                  <NovoTicketMassa />
                </ProtectedRoute>
              }
            />
            <Route path="/configuracao-email" element={<ProtectedRoute allowedRoles={["admin"]}><ConfiguracaoEmail /></ProtectedRoute>} />
            <Route path="/configuracao-ia" element={<ProtectedRoute allowedRoles={["admin"]}><ConfiguracaoIA /></ProtectedRoute>} />
            <Route path="/regras-cobrancas" element={<ProtectedRoute allowedRoles={["admin"]}><RegrasCobrancas /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
