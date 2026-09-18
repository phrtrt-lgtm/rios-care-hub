# Prompt de apresentação — Claude Code no Portal RIOS

Copie **todo o bloco abaixo** e cole como primeira mensagem no Claude Code depois de abrir o repositório sincronizado do GitHub.

---

Você acaba de ser conectado ao repositório do **Portal RIOS Hospedagens** (https://portal.rioshospedagens.com.br), um sistema de gestão de aluguel por temporada usado por três públicos: administração RIOS, equipe (manutenção/faxina/vistorias) e proprietários dos imóveis.

Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui no front; Supabase (Postgres com RLS, Auth, Storage, Edge Functions em Deno) no back; app móvel via Capacitor com live updates apontando para o domínio do portal.

## Fase 1 — Captar o contexto (só leitura, não altere nada)

1. Leia `README.md`, `PORTAL_FUNCIONALIDADES.md`, `package.json`, `src/App.tsx` (todas as rotas), `src/index.css` e `tailwind.config.ts` (tokens de design), `src/hooks/useAuth.tsx` e `src/components/ProtectedRoute.tsx` (papéis e permissões).
2. Mapeie os papéis de usuário e o que cada um acessa: `admin`, `agent`, `maintenance`, `cleaner`, `owner`, `pending_owner`, além do acesso restrito `curation_only`.
3. Mapeie os módulos de negócio e como se ligam: manutenções (tickets → conclusão → envio ao proprietário → cobrança), cobranças (janela de pagamento de 7 dias, score de pagamento do proprietário, débito em reserva retroativo, ajustes manuais, cobranças recorrentes), vistorias (faxina, rotina, internas), curadoria de imóveis, comissões de reserva, relatórios financeiros, chat em tempo real, notificações push/e-mail, sincronização com Hostex (reservas, iCal, fotos de capa).
4. Leia `supabase/functions/` para entender as integrações (IA, e-mail, Mercado Pago/PIX, Hostex, notificações) e `supabase/migrations/` para o modelo de dados e as políticas de RLS.
5. Documente o sistema de design real: tokens semânticos de cor (`primary`, `secondary`, `success`, `info`, `warning`, `destructive`, `muted-foreground`), componentes padrão `EmptyState` e `SectionSkeleton`, padrões de navegação mobile (`MobileBottomNav`, `MobileHeader`), sheets de detalhe e galerias de anexos.

## Regras invioláveis do projeto (respeite ao propor qualquer mudança)

- **Nunca** use cores cruas do Tailwind (`text-blue-600`, `bg-emerald-500`, `bg-[#...]`). Apenas tokens semânticos. Exceção: telas de tutorial e a escala de ranking do score.
- Estados vazios e de carregamento sempre com `EmptyState` e `SectionSkeleton`. Sem emojis, sem "Carregando..." solto.
- Nunca crie prazos/contadores de SLA em tickets.
- Nomes de arquivos anexados são anonimizados (rótulos genéricos como "Imagem", "PDF").
- Proprietário não tem acesso ao calendário de reservas.
- Janela de pagamento é de 7 dias; penalidade de score só depois disso.
- Papéis ficam em tabela separada, checados por função `security definer` — nunca no perfil do usuário.
- Botões de voltar em listas usam `replace: true` para não criar loop de navegação.
- Não mexa em arquivos autogerados: `src/integrations/supabase/client.ts`, `previewAuthStorage.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- Textos do produto em português do Brasil.

## Fase 2 — Salvar o contexto

Crie (ou atualize) `CLAUDE.md` na raiz com um resumo denso e verificado: arquitetura, papéis, módulos, fluxos críticos, regras de negócio acima, sistema de design e armadilhas conhecidas. Tudo com referências `arquivo:linha`. Nada de suposições — se não confirmou no código, marque como dúvida.

## Fase 3 — Auditoria de problemas atuais

Rode uma varredura e liste achados com evidência (`arquivo:linha`), impacto e esforço:

- **Performance**: tamanho do bundle e code-splitting por rota, componentes gigantes (vários passam de 1.000 linhas), queries em cascata/N+1 contra o banco, `select('*')` onde só precisa de campos, listas sem paginação ou virtualização, imagens e vídeos sem tamanho/`loading="lazy"`, re-renders evitáveis, cache de dados (React Query) mal configurado.
- **Design e UX**: inconsistências entre telas equivalentes de admin e proprietário, cores cruas remanescentes, contraste e acessibilidade (rótulos, foco, leitura por leitor de tela), hierarquia visual, densidade de informação, textos e mensagens de erro.
- **Mobile do proprietário** (prioridade máxima): tudo precisa funcionar com o celular em pé, sem rolagem horizontal; alvos de toque adequados; áreas seguras do iOS; anexos e galerias abrindo em popup; formulários usáveis com teclado aberto; peso de página em rede ruim.
- **Desktop**: aproveitamento de tela larga, tabelas e filtros, atalhos, telas que ainda parecem "mobile esticado".
- **Robustez**: tratamento de erro e estados de falha, funções que engolem exceções, uploads que podem perder anexos, condições de corrida em tempo real, RLS frouxa ou ausente, dados sensíveis expostos ao cliente.

## Fase 4 — Roadmap

Escreva `ROADMAP.md` priorizado, em ondas curtas, com foco em velocidade, design e a experiência do proprietário no celular e no desktop. Para cada item: problema, evidência no código, proposta, arquivos afetados, risco de regressão e como validar. Separe em: (1) correções de bug e risco, (2) ganhos rápidos de performance, (3) unificação do sistema de design, (4) melhorias estruturais maiores.

**Não implemente nada nesta rodada.** Entregue `CLAUDE.md`, `ROADMAP.md` e um resumo executivo de no máximo 15 linhas com os cinco itens de maior impacto. Depois espere minha escolha do que atacar primeiro.
