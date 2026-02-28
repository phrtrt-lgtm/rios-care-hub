# Portal RIOS — Funcionalidades Completas

## Visão Geral

O Portal RIOS é uma plataforma de gestão de imóveis de temporada que conecta proprietários, equipe de gestão, faxineiras e prestadores de serviço em um único sistema integrado. O portal oferece transparência total sobre manutenções, cobranças, chamados, vistorias e votações, com comunicação em tempo real entre todas as partes.

---

## 1. Painel do Proprietário (Minha Caixa)

O proprietário acessa um painel personalizado que centraliza todas as informações relevantes do(s) seu(s) imóvel(is).

### 1.1 Visão Geral do Painel
- Resumo de manutenções em andamento com status visual
- Chamados abertos e histórico
- Cobranças pendentes e histórico de pagamentos
- Propostas de votação aguardando resposta
- Score de pontualidade de pagamentos
- Acesso rápido a tutoriais e protocolo de manutenções

### 1.2 Score de Pagamentos
- Pontuação de 0 a 100 que reflete o histórico de pontualidade do proprietário
- Acompanhamento em tempo real com histórico de alterações
- Sistema de gamificação para incentivar pagamentos em dia

### 1.3 Protocolo de Manutenções
- Documento explicativo sobre o fluxo completo do sistema de manutenções
- Detalhamento das responsabilidades de cada parte (proprietário, gestora, hóspede)
- Justificativa do "Aporte de Gestão" (contribuição da empresa no custo)

---

## 2. Gestão de Imóveis

### 2.1 Propriedades do Proprietário
- Visualização de todas as unidades vinculadas ao proprietário
- Foto de capa de cada imóvel
- Endereço e informações básicas
- Histórico de manutenções por imóvel
- Histórico de vistorias por imóvel

### 2.2 Calendário de Reservas
- Visualização de reservas via integração com iCal (Airbnb, Booking, etc.)
- Sincronização automática de calendários externos
- Identificação de períodos livres e ocupados

---

## 3. Sistema de Manutenções

### 3.1 Abertura de Manutenções
- Criação de manutenção com título, descrição detalhada e prioridade
- Seleção de imóvel e proprietário vinculado
- Definição de responsabilidade pelo custo: proprietário, gestora ou hóspede
- Para manutenções de responsabilidade do hóspede: data de check-out para automação de cobrança
- Upload de fotos e vídeos como evidência (até 30 anexos)
- Compressão automática de vídeos para otimização
- Geração automática de descrição por Inteligência Artificial

### 3.2 Acompanhamento por Kanban
- Quadro visual com colunas por status: Aberto → Em Andamento → Aguardando Proprietário → Concluído
- Cards com informações resumidas: imóvel, descrição, responsável, data
- Prévia do kanban no painel do proprietário
- Filtros por imóvel, status e responsabilidade

### 3.3 Chat de Manutenção
- Canal de comunicação dedicado para cada manutenção
- Envio de mensagens de texto, fotos, vídeos e áudios
- Transcrição automática de áudios por IA
- Geração de resposta profissional sugerida por IA
- Recibos de leitura (✓✓ azul quando lido)
- Notificações push em tempo real
- Galeria de mídia integrada ao chat

### 3.4 Decisão do Proprietário
- Interface dedicada para proprietários aprovarem ou rejeitarem propostas de manutenção
- Exibição do custo estimado e divisão de responsabilidade
- Campo para observações do proprietário
- Prazo para decisão com notificação automática

### 3.5 Aporte de Gestão
- Campo para registrar contribuição da gestora no custo da manutenção
- Cálculo automático da divisão de custo entre proprietário e gestora
- Exibido de forma transparente no resumo da cobrança

### 3.6 Pagamento de Manutenções
- Registro de pagamentos com data, método e valor
- Upload de comprovante de pagamento
- Suporte a múltiplos pagamentos parciais por manutenção

### 3.7 Arquivo de Manutenções
- Histórico completo de manutenções concluídas
- Filtros por período, imóvel e tipo de serviço
- Gráficos e relatórios de ocorrências

### 3.8 Profissionais de Serviço
- Cadastro de prestadores de serviço com especialidade e contato
- Agendamento direto a partir dos cards de manutenção
- Notificação automática no chat ao agendar profissional

---

## 4. Sistema de Chamados (Tickets)

### 4.1 Abertura de Chamados
- Proprietário abre chamado com título e descrição
- Categorização por tipo
- Possibilidade de anexar fotos e vídeos
- Abertura em massa para múltiplos proprietários simultaneamente (admin)
- Abertura de chamados internos (somente para a equipe)

### 4.2 Acompanhamento
- Listagem de todos os chamados do proprietário com status atualizado
- Kanban administrativo para gestão da equipe
- Filtros por status, prioridade e imóvel

### 4.3 Chat de Chamados
- Canal de comunicação em tempo real por chamado
- Suporte a texto, fotos, vídeos e áudios
- Gravação de áudio diretamente no navegador e app
- Transcrição de áudio por IA
- Resposta profissional sugerida por IA
- Templates de resposta rápida para a equipe
- Recibos de leitura com indicador visual
- Badges de mensagens não lidas no painel
- Sumário automático da conversa por IA

### 4.4 Histórico de Comunicação
- Registro completo de todas as interações por chamado
- Exportação do histórico quando necessário

---

## 5. Sistema de Cobranças

### 5.1 Criação de Cobranças
- Geração de cobrança vinculada ao proprietário e/ou imóvel
- Categorias: manutenção, taxa administrativa, débito de reserva, etc.
- Definição de vencimento, valor e moeda
- Descrição detalhada com suporte a IA para geração de texto
- Anexação de comprovantes e evidências

### 5.2 Métodos de Pagamento
- Integração com MercadoPago para pagamento online
- Geração de PIX com QR Code e código copia-e-cola
- Link de pagamento direto
- Registro manual de pagamento com comprovante

### 5.3 Débito em Reserva
- Mecanismo para descontar cobranças diretamente do valor de reservas futuras
- Calculadora de débito com preview do impacto no repasse
- Notificação automática ao proprietário antes do débito

### 5.4 Lembretes Automáticos
- Envio automático de lembretes de vencimento (48h e 24h antes)
- Notificações push e por e-mail
- Sistema de cobrança para débitos de hóspedes (14 dias após check-out)

### 5.5 Chat de Cobrança
- Canal de comunicação dedicado para esclarecimentos sobre cada cobrança
- Histórico de negociações e acordos
- Suporte a envio de comprovantes pelo proprietário

### 5.6 Painel Administrativo de Cobranças
- Visão geral de todas as cobranças por status
- Filtros por proprietário, imóvel, categoria e período
- Kanban de cobranças em aberto
- Regras de cobrança configuráveis

---

## 6. Sistema de Vistorias

### 6.1 Realização de Vistorias
- Formulário estruturado para vistoria de limpeza pós-saída de hóspede
- Checklist de rotina com itens predefinidos (ar-condicionado, banheiro, cozinha, TV, etc.)
- Identificação de problemas por categoria com campo de observação
- Registro de contagem de itens (almofadas, copos, etc.)
- Gravação de áudio descritivo da vistoria
- Upload de até 30 fotos e vídeos como evidência
- Salvamento de rascunho automático para não perder progresso

### 6.2 Resumo por Inteligência Artificial
- Geração automática de relatório a partir das observações e transcrição de áudio
- Categorização de problemas por tipo de serviço (Hidráulica, Elétrica, Limpeza, etc.)
- Priorização automática de itens críticos
- Texto profissional pronto para compartilhamento

### 6.3 Triagem Kanban de Problemas
- Visualização de todos os itens com problema da vistoria em formato Kanban
- Criação de manutenções em lote diretamente da triagem
- Importação de fotos da vistoria para a manutenção criada

### 6.4 Criação de Manutenção a partir da Vistoria
- Fluxo integrado: vistoria → manutenção com 1 clique
- Pré-preenchimento automático com dados da vistoria (imóvel, descrição, resumo de IA)
- Seleção de fotos específicas da vistoria para anexar
- Definição de responsabilidade pelo custo

### 6.5 Calendário de Vistorias
- Visualização de vistorias agendadas e realizadas por período
- Filtro por imóvel e faxineira

### 6.6 Portal do Proprietário para Vistorias
- Proprietários com acesso habilitado podem visualizar vistorias do seu imóvel
- Acesso controlado individualmente por imóvel (configurável pela gestora)
- Exibição do relatório completo com fotos e resumo de IA

### 6.7 Vistorias por Equipe
- Múltiplos membros da equipe podem colaborar em uma mesma vistoria
- Controle de quem realizou cada vistoria

---

## 7. Sistema de Votações/Propostas

### 7.1 Criação de Propostas
- Criação de votações com título, descrição e prazo
- Tipos: aprovação simples, múltiplas opções, compra em grupo
- Definição de público-alvo: todos os proprietários, proprietário específico ou imóvel específico
- Anexação de documentos e imagens de suporte
- Valor em centavos para propostas que envolvem pagamento

### 7.2 Resposta dos Proprietários
- Interface clara de aprovação/rejeição com campo de observação
- Votações pendentes destacadas no topo do painel
- Notificação push e por e-mail ao criar nova proposta
- Indicador de prazo para resposta

### 7.3 Painel de Compras em Grupo
- Propostas de compra coletiva com seleção de quantidade por proprietário
- Cálculo automático do total por proprietário
- Geração de cobrança individual após fechamento

### 7.4 Resultado das Votações
- Contador em tempo real de aprovações e rejeições
- Encerramento automático após prazo
- Histórico completo de todas as votações

---

## 8. Sistema de Alertas

### 8.1 Envio de Alertas
- Criação de alertas informativos para proprietários
- Tipos: informativo, urgente, aviso
- Público-alvo: todos os proprietários ou segmentado
- Data de expiração configurável
- Suporte a anexos (fotos, documentos)

### 8.2 Recebimento
- Exibição no painel do proprietário com destaque visual
- Controle de leitura por destinatário
- Notificação push para alertas urgentes

---

## 9. Notificações

### 9.1 Notificações Push
- Notificações em tempo real no navegador (web push)
- Suporte a notificações nativas no aplicativo móvel (Android/iOS)
- Configuração por tipo de evento

### 9.2 Notificações por E-mail
- E-mails automáticos para novos chamados, cobranças, vistorias e alertas
- Templates personalizados com identidade visual da gestora
- Configuração de domínio de e-mail próprio

### 9.3 Central de Notificações
- Sino de notificações no cabeçalho com badge de não lidas
- Listagem de todas as notificações com link para o item relacionado
- Marcar como lida individualmente ou em lote

---

## 10. Perfil e Conta

### 10.1 Perfil do Proprietário
- Foto de perfil com upload e recorte
- Nome, e-mail e telefone
- Alteração de senha segura

### 10.2 Autenticação
- Login com e-mail e senha
- Recuperação de senha por e-mail
- Proteção de rotas por perfil de acesso
- Múltiplos perfis: proprietário, admin, agente, equipe de manutenção, faxineira

---

## 11. Painel Administrativo

### 11.1 Dashboard da Equipe
- Visão consolidada de todos os chamados, manutenções e vistorias
- Kanban de manutenções com drag-and-drop
- Kanban de chamados
- Preview de cobranças em aberto
- Resumo diário gerado por IA

### 11.2 Gestão de Usuários
- Cadastro de proprietários com vinculação ao imóvel
- Cadastro de membros da equipe com perfil de acesso
- Cadastro de faxineiras
- Aprovação de cadastros pendentes
- Exclusão de usuários

### 11.3 Relatórios e Insights
- Gráficos de manutenções por tipo de serviço
- Evolução de chamados ao longo do tempo
- Resumo de cobranças por período
- Relatório por propriedade
- Exportação de dados

### 11.4 Chat da Equipe
- Canal interno de comunicação para a equipe de gestão
- Mensagens em tempo real com histórico

### 11.5 Configurações do Sistema
- Configuração de IA (modelo, temperatura, prompt do sistema)
- Templates de resposta rápida para chamados
- Configuração de e-mail transacional
- Configurações de vistorias por imóvel

---

## 12. Aplicativo Móvel

### 12.1 Progressive Web App (PWA)
- Instalável no celular como aplicativo nativo
- Funciona offline com sincronização automática
- Ícone personalizado na tela inicial

### 12.2 App Android/iOS (Capacitor)
- Versão nativa para distribuição nas lojas
- Câmera nativa para fotos e vídeos
- Gravação de áudio nativa
- Notificações push nativas
- Seletor de arquivos nativo

### 12.3 Otimização Mobile
- Interface responsiva adaptada para telas pequenas
- Navegação inferior (bottom nav) para acesso rápido
- Pull-to-refresh para atualizar dados
- Cards deslizáveis (swipe) para ações rápidas

---

## 13. Integrações

### 13.1 MercadoPago
- Geração de links de pagamento
- PIX com QR Code automático
- Webhook para confirmação automática de pagamento
- Atualização automática do status da cobrança

### 13.2 Calendários iCal
- Importação de reservas do Airbnb, Booking.com e outros
- Sincronização automática periódica
- Visualização unificada de disponibilidade

### 13.3 Monday.com
- Exportação de chamados para o Monday
- Download de assets e anexos do Monday
- Sincronização bidirecional via webhook

### 13.4 Inteligência Artificial
- Geração de descrições de manutenção
- Transcrição de áudios em texto
- Sugestão de respostas profissionais
- Resumo automático de conversas
- Análise e resumo de vistorias
- Categorização de problemas por tipo de serviço
- Resumo diário da operação

---

## 14. Segurança e Acesso

- Autenticação segura com tokens JWT
- Controle de acesso por perfil (RBAC)
- Políticas de segurança por tabela (RLS)
- Cada proprietário vê apenas seus próprios dados
- Comunicações criptografadas (HTTPS)
- Armazenamento seguro de arquivos com URLs temporárias

---

## 15. Onboarding

### 15.1 Tour de Boas-vindas
- Tour interativo guiado para novos proprietários
- Apresentação das principais funcionalidades passo a passo
- Disponível para revisão a qualquer momento nas configurações de perfil

### 15.2 Tutoriais
- Guias detalhados em vídeo/texto para cada funcionalidade
- Tutoriais específicos para proprietários e para a equipe
- Cobrindo: chamados, cobranças, vistorias, votações e alertas

---

*Documento gerado automaticamente com base nas funcionalidades implementadas no Portal RIOS.*
