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
import NotFound from "./pages/NotFound";
import TicketDetalhes from "./pages/TicketDetalhes";
import NovaCobranca from "./pages/NovaCobranca";

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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
