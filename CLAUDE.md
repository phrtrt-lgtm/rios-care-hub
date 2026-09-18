# CLAUDE.md — Portal RIOS Hospedagens

Contexto de trabalho para agentes de IA neste repositório.
Levantado por leitura direta do código em **2026-09-18**, sobre o commit `4c49831`.

> **Regra de ouro:** tudo aqui tem referência `arquivo:linha`.
> O que não foi confirmado no código está marcado como **[DÚVIDA]**.
> Antes de confiar neste documento, rode `git log -1` — se o HEAD mudou muito, revalide.

---

## 1. O que é

Portal web + app móvel de gestão de aluguel por temporada da RIOS Hospedagens.
Produção: https://portal.rioshospedagens.com.br

Públicos: **administração/equipe RIOS**, **prestadores** (faxina/manutenção) e **proprietários**.

**Projeto Lovable** (`README.md:5`, id `3e755580-de69-4b87-9e32-0e8bf7881879`) sincronizado com o GitHub `phrtrt-lgtm/rios-care-hub`.

### Tamanho

| | |
|---|---|
| Linhas em `src/` | **96.963** (390 arquivos) |
| Páginas | **92** · Rotas: **91** (`src/App.tsx`) |
| Edge functions | **72** |
| Migrations | **171** |
| Tabelas no schema vivo | ~80 (`src/integrations/supabase/types.ts`) |
| Bundle de produção | chunk inicial **936 kB / 264 kB gzip** + chunks por rota (era 4,4 MB / 1,22 MB num único chunk até 2026-09-18) |

### Stack

| Camada | O que é | Onde |
|---|---|---|
| Front | React 18.3 + Vite 5.4 + TypeScript 5.8 | `package.json` |
| UI | Tailwind 3.4 + shadcn/ui (Radix) + lucide-react + **framer-motion** | `src/components/ui/` |
| Dados | `@tanstack/react-query` — adoção parcial, ver §6 | |
| Back | Supabase (Postgres + RLS + Auth + Storage + Edge Functions Deno) | `supabase/` |
| Mobile | Capacitor 7.4 — **exceto `@capacitor/camera` em 8.0**, que conflita; ver §8.10 | `capacitor.config.ts` |
| Push | Firebase FCM v1 | `supabase/functions/send-push/` |
| Pagamento | Mercado Pago (PIX, cartão, parcelado, pagamento em grupo) | `create-*-p{ix,ayment}/` |
| E-mail | Resend | `supabase/functions/_shared/` |
| Integrações | **Hostex** (reservas/calendário), **Monday.com** (legado) | `hostex-sync/`, `monday-webhook/` |

---

## 2. Papéis e acesso

Enum `app_role`: `admin`, `agent`, `maintenance`, `owner`, `cleaner`, `pending_owner`.
O papel fica na **coluna `role` de `profiles`** — ver §8.1, contraria a regra nº 7 e abre escalação de privilégio.

Além do papel, existe a flag booleana **`profiles.curation_only`**: usuário que só acessa a área de curadoria. O gate está em `src/components/ProtectedRoute.tsx:26-31`, com as rotas liberadas em `:11` (`/minha-curadoria`, `/definir-senha`).

Redirecionamento de entrada: `src/pages/Index.tsx`.
`owner` → `/minha-caixa` · `cleaner` → `/faxineira` · `agent`/`admin`/`maintenance` → `/painel` · `pending_owner` → `/aguardando-aprovacao`.

### Rotas públicas (sem `ProtectedRoute`)

`/login` · `/cadastro` · `/cadastro-imovel` + `/cadastro-imovel/obrigado` (ficha pública de captação) · `/aguardando-aprovacao` · `/definir-senha` · `/curadoria/p/:id` · `/debug-app`

> `/debug-app` (`src/pages/DebugApp.tsx`) é público mas **não expõe nada sensível** — só build, host, user-agent e flags de PWA/Capacitor. Não é falha.
>
> `/curadoria/p/:id` (`CuradoriaPublica.tsx:32`) consulta `owner_curations` com a chave anônima. O RLS (`20260507190601_*.sql:21-28`) só libera para o dono ou para a equipe — então **um visitante anônimo vê a tela vazia**. Na prática é preview da equipe, não link público. **[DÚVIDA]** se a intenção era ser público de verdade.

### Grupos de rota

- **Proprietário:** `/minha-caixa`, `/minhas-cobrancas`, `/novo-ticket`, `/meus-chamados`, `/vistorias`, `/minha-curadoria`, `/minhas-comissoes-booking`, `/relatorio-financeiro`, `/contrato/:id`, `/bem-vindo`
- **Equipe:** `/painel`, `/todos-tickets`, `/propriedades`, `/gerenciar-cobrancas`, `/admin/vistorias*`, `/admin/chamados`, `/admin/manutencoes*`, `/booking-comissoes`, `/admin/central-hostex`, `/admin/contratos*`, `/admin/curadorias`
- **Só admin:** `/configuracao-email`, `/configuracao-ia`, `/admin/gerenciar-usuarios`, `/admin/cadastrar-equipe`, `/admin/vistorias/configuracoes`
- **`cleaner`:** `/faxineira`, `/rotina-profissional`, `/protocolo-trabalho`

> `/calendario-reservas` **redireciona para `/admin/central-hostex`** (`src/App.tsx:527`), área da equipe. A regra "proprietário não vê calendário de reservas" está respeitada.

---

## 3. Módulos

### 3.1 Chamados / Manutenções — modelo híbrido, atenção
`tickets` é a tabela central e ganhou **dezenas de colunas** de manutenção: `kind`, `essential`, `cost_responsible`, `split_owner_percent`, `owner_decision`, `owner_action_due_at`, `charge_draft_*`, `service_provider_id`, `scheduled_at`, `maintenance_ticket_id`.

Manutenção hoje vive nos **dois** lados: `useMaintenances.ts:46` consulta `charges`, e `:179`/`:281` consultam `tickets`. Ao mexer aqui, confirme de qual lado vem cada campo.

Fluxo essencial vs estrutural: item `essential` pode ser executado de imediato; estrutural gera decisão do proprietário com prazo em `owner_action_due_at`, lembrado por `owner-decision-cron`.

> ⚠️ `tickets` tem `sla_due_at` e `first_response_at` — resíduo. A regra nº 3 proíbe SLA; não construa UI sobre essas colunas.

### 3.2 Cobranças
`charges`, `charge_payments`, `charge_messages`, `charge_attachments`, `recurring_charges`, `recurring_charge_runs`, `owner_credits`, `owner_credit_applications`.

**Janela de 7 dias:** emissão → 7 dias para pagar ou contestar → pagamento, contestação ou timeout → liquidação ou **offset (débito em reserva)** (`debit-reserve/`, `debit-reserve-now/`, `reserve-debit-revert-alert/`).

**Score do proprietário** (0–100, default 50): antecipado **+5**, em dia **+1**, atraso **−15**, débito em reserva **−30** (`mercadopago-webhook/index.ts` e `src/hooks/useOwnerScore.ts`). Estrelas: ≥90 / ≥75 / ≥60 / ≥40. Histórico em `owner_payment_scores`.

### 3.3 Vistorias
`cleaning_inspections`, `inspection_items`, `inspection_settings`, `inspection_comments`, `inspection_drafts`, `routine_inspection_checklists`. Vistoria de faxina, rotina e interna. Resumo por IA: `generate-inspection-summary`, `summarize-inspection`.
Proprietário só vê se `inspection_settings.owner_portal_enabled = true`.

### 3.4 Curadoria
`owner_curations`, `curation_access_tokens`, `curadoria_messages`. Equipe monta em `/admin/curadoria/nova`, proprietário escolhe itens em `/minha-curadoria` e paga por PIX. Pago → vira ticket de compra.
Functions: `create-curation-pix`, `save-curation-selection`, `curation-access`, `notify-curation-{ready,paid}`, `curadoria-ai`. **Todas com falhas graves — ver §8.2 e §8.3.**

### 3.5 Comissões de reserva (Booking)
`booking_commissions` + `_messages` + `_attachments`. Importação em `/importar-comissoes-booking`, visão do proprietário em `/minhas-comissoes-booking`, relatório em `/admin/relatorio-booking`, comissão RIOS em `/admin/comissao-rios`. PIX próprio: `create-booking-pix`, `create-group-booking-payment`.

### 3.6 Hostex
`hostex_properties`, `hostex_reservations`, `hostex_listing_calendar`, `hostex_sync_log`. Sincronização por `hostex-sync` (cron + manual) e `hostex-proxy`. Central em `/admin/central-hostex`.

### 3.7 Contratos
`contracts`, `contract_templates`, `contract_events`, `contract_owner_submissions`, `contract_submission_attachments`. Admin em `/admin/contratos`, assinatura do proprietário em `/contrato/:id`.

### 3.8 Fichas de imóvel e captação
`property_files`, `property_file_versions`, `property_intake_submissions`, `property_members`. Ficha pública `/cadastro-imovel` → `submit-property-intake`. Edição em `/admin/fichas-imoveis`, `/atualizacao-anuncio`. Parsing por IA: `parse-ficha-anuncio`, `bulk-edit-fichas`.

### 3.9 Relatórios financeiros
`financial_reports`, `financial_report_audit_log`. `/relatorio-financeiro/:id` (proprietário) e `/admin/relatorios-financeiros`. Envio por `send-report-email`.

### 3.10 Chat, notificações, IA
Chat por contexto (`ticket_messages`, `charge_messages`, `curadoria_messages`, `booking_commission_messages`, `team_chat_messages`) + `message_read_receipts` e `notify-mentions` (menções com `mentioned_user_ids`).
IA: `ai_settings`, `ai_templates`, `ai_prompt_versions`, `ai_usage_logs`; `ai-assistant`, `ai-consulta`, `summarize-conversation`, `transcribe-audio`.

---

## 4. Regras invioláveis — e o status real de cada uma

| # | Regra | Status hoje |
|---|---|---|
| 1 | Só tokens semânticos, nunca cor crua do Tailwind. Exceção: tutorial e escala do score | ❌ **804 ocorrências** fora de `ui/` (os tokens agora existem — ver §5, não há mais desculpa) |
| 2 | `EmptyState` e `SectionSkeleton` para vazio/carregamento. Sem emoji, sem "Carregando..." solto | ❌ **os dois componentes não existem**. 34 "Carregando" soltos. Existe `SkeletonLoading.tsx` e o `Skeleton` do shadcn (26 arquivos) — base para criar o padrão |
| 3 | Nunca criar prazo/contador de SLA em ticket | ✅ na UI (colunas legadas seguem no banco) |
| 4 | Nome de anexo anonimizado ("Imagem", "PDF") | ❌ `file_name` real ainda exibido (`AttachmentBubble.tsx`) |
| 5 | Proprietário não vê calendário de reservas | ✅ `/calendario-reservas` redireciona para área da equipe (`App.tsx:527`) |
| 6 | Janela de 7 dias; penalidade só depois | ✅ |
| 7 | Papel em tabela separada, checado por `security definer` | ❌ **`role` é coluna de `profiles`**; não existe `user_roles` em 171 migrations |
| 8 | Voltar de lista usa `replace: true` | ⚠️ parcial |
| 9 | Não mexer em autogerados | `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` |
| 10 | Produto em pt-BR | ✅ na UI — `index.html:2` ainda diz `lang="en"` |

---

## 5. Sistema de design

**Tokens** (`src/index.css`, 436 linhas, claro + escuro). Além da base shadcn:

```
--rios-blue / --rios-blue-deep / --rios-blue-light / --rios-terra / --rios-terra-light
--success --success-foreground    --warning --warning-foreground    --info --info-foreground
--shadow-sm --shadow-md --shadow-lg --shadow-xl
```

`success`, `warning` e `info` **existem hoje** (`tailwind.config.ts:34-45`) — foram adicionados depois de dezembro. Use-os: `bg-success`, `text-warning`, `border-info`.

**Componentes de padrão que existem:**
`MobileBottomNav.tsx` (191L, usado em 7 telas) · `MobileHeader.tsx` (95L, 4 telas) · `LoadingScreen.tsx` (19 telas) · `SkeletonLoading.tsx` · `AnimatedCard`, `Section`, `PullToRefresh`, `SwipeableCard`, `OwnerOnboardingTour` (framer-motion) · `MediaGallery` / `MediaThumbnail` / `AttachmentBubble` / `AuthenticatedMedia`.

**Não existem:** `EmptyState`, `SectionSkeleton`. Criar antes de usar.

Piores ofensores de cor crua: `OwnerScoreDisplay` (exceção legítima), `CobrancaDetalhes`, `AdminManutencoesLista`, `PropostaCompleta`, `MinhasCobrancas`.

---

## 6. Padrões de dados

Convivem React Query e `useEffect` + `supabase` manual. `new QueryClient()` **sem `defaultOptions`** (`src/App.tsx:102`) → `staleTime: 0`, refetch a cada montagem.

Sinais: **59** `select('*')` · apenas **4** `.range()` (quase nenhuma paginação) · **80** `<img>` e só **1** com `loading="lazy"` · **75** `console.log`.

### ⚠️ `supabase/migrations/` não é a fonte da verdade

Tabelas existem no banco sem migration correspondente e vice-versa. **Nenhuma conclusão sobre RLS tirada só das migrations é definitiva** — confirme no banco antes de agir. Vale para tudo em §8.

---

## 7. Edge functions — superfície pública

**21 das 72 rodam sem JWT** (`supabase/config.toml`, `verify_jwt = false`):

| Situação | Funções |
|---|---|
| ✅ Com guarda adequada | `charge-cron`, `daily-summary-cron`, `recurring-charges-cron` (token), `monday-webhook`, `submit-property-intake` (não sobrescreve senha de conta existente; link de recuperação só por e-mail) |
| ⚠️ Guarda contornável | `hostex-sync` (o token só é checado quando `force` é falso, e `force` vem da query string — `index.ts:89-97`) |
| ❌ Sem guarda nenhuma | `create-curation-pix`, `save-curation-selection`, `curation-access`, `send-push`, `notify-ticket`, `notify-owner-decision`, `notify-curation-paid`, `notify-booking-commission`, `notify-booking-commission-paid`, `migrate-attachments`, `owner-decision-cron`, `generate-service-summary` |
| Webhook externo (ok não ter JWT, mas ver §8.9) | `mercadopago-webhook` |

A URL do projeto Supabase é pública por construção — está no bundle que todo visitante baixa. "Ninguém sabe o endereço" não é proteção.

### ⚠️ `verify_jwt = true` é uma barreira fraca

Ele exige apenas **um JWT válido** — e a chave publicável (`VITE_SUPABASE_PUBLISHABLE_KEY`) é um JWT válido, presente no bundle de todo visitante. Ou seja, `verify_jwt = true` filtra quem não manda header nenhum, mas **não distingue um proprietário de um admin, nem um usuário de um anônimo com a chave pública**.

Toda function que faz operação privilegiada precisa de checagem **no código**, lendo o usuário do token e conferindo o papel. Use o helper `supabase/functions/_shared/auth-guard.ts` (`exigirPapel`), aplicado hoje em `debit-reserve`, `debit-reserve-now`, `credit-manual` e `hostex-sync`. Funções chamadas só de servidor para servidor precisam de segredo compartilhado, não de JWT.

### ⚠️ O repositório não mostra todas as functions publicadas

O painel do Lovable Cloud lista **74 functions publicadas**; `supabase/functions/` tem **70**. Quatro rodam em produção sem código no Git: **`create-user`**, **`process-all-videos`**, **`process-video`**, **`seed-test-lead`**. Elas não aparecem em nenhuma revisão de código. Ver `ROADMAP.md` item 1.9.

### Deploy de edge function

O Lovable **não redeploya function a cada push no GitHub** — só quando o agente dele roda. Um commit corrigindo uma function fica no repositório sem efeito em produção até o próximo turno do agente. Para forçar, peça ao agente do Lovable (consome crédito). O painel do Cloud é só leitura: mostra código, métricas e logs, mas não tem deletar nem publicar.

---

## 8. Armadilhas conhecidas

Correção, evidência e plano: `ROADMAP.md`.

1. **Escalação de privilégio via `profiles`** 🔴 — policy `FOR UPDATE USING (auth.uid() = id)` sem `WITH CHECK` nem restrição de coluna (`20251026001141_*.sql:136-138`), com `role` e `payment_score` na mesma linha. 171 migrations depois, nunca revisada; sem trigger guardando `NEW.role`.
2. ~~**`admin-reset-password` é tomada de conta anônima**~~ ✅ **resolvido em 2026-09-18** — função apagada do backend e do repositório (commit `5c26493`), remoção verificada por requisição direta ao endpoint. Mantido aqui como registro: era uma função de 23 linhas, `verify_jwt = false`, sem checagem, com service role, chamando `auth.admin.updateUserById` — qualquer pessoa trocava a senha de qualquer conta sem estar logada. Ficou publicada de maio a setembro de 2026.
3. **Curadoria pode ser paga por R$ 1,00** 🔴 — `create-curation-pix/index.ts:19,48` usa `total_amount_cents` **do corpo da requisição** como valor do PIX, sem conferir contra o preço real; comentário em `:24` assume que não há risco. O webhook nunca compara `transaction_amount`. `save-curation-selection` também é aberta e aceita `total_amount_cents` do cliente.
4. **`curation-access` dá login permanente** 🔴 — lê `used_at` (`index.ts:25`) mas **nunca o checa** (`:29`); marca como usado em "best-effort". Link de curadoria encaminhado, em histórico ou em log de e-mail = login como aquele proprietário, para sempre.
5. **`ProtectedRoute` libera quem não tem perfil** 🟠 — `src/components/ProtectedRoute.tsx:33`: `profile &&` faz a checagem de papel ser pulada quando o perfil é nulo. O gate de `curation_only` (`:27`) tem o mesmo problema.
6. **`send-push` sem autenticação** 🟠 — aceita `ownerId` + `title`/`body`/`url` arbitrários. Push de phishing para qualquer usuário, com a marca RIOS.
7. **N+1 em manutenções** 🟠 — `src/hooks/useMaintenances.ts:84-94`: busca todas as charges (sem `limit`, `select('*')`) e faz uma query de `charge_payments` por charge.
8. ~~**Bundle de 4,4 MB num chunk só**~~ ✅ **resolvido em 2026-09-18** — 87 das 91 páginas viraram `lazyPage()` (`src/lib/lazyPage.ts`, um `lazy()` com recuperação de chunk obsoleto), `<Routes>` dentro de `<Suspense>`, e `manualChunks` separando `recharts`, `framer-motion` e `jszip`. Chunk inicial caiu de 1.253 kB para **264 kB gzip**. Ao criar página nova, **use `lazyPage`, não `import` estático** — senão o peso volta para o chunk inicial.
9. **Webhook do MP: idempotência frágil e sem conferência de valor** 🟠 — o check-then-insert (`mercadopago-webhook/index.ts:579-600`) foi adicionado, mas sem constraint única duplica sob corrida, e `maybeSingle()` falha se já houver duplicatas. `transaction_amount` nunca é comparado com o valor da cobrança. Erro devolve 500, o que provoca reentrega.
10. **`npm install` quebra numa instalação limpa** 🟠 **(parcialmente corrigido)** — `@capacitor/camera` e `@capacitor/filesystem` voltaram para a 7.x em 2026-09-18, mas **`@capawesome/capacitor-file-picker` segue em `^8.0.0`** e também exige `@capacitor/core >=8.0.0` (o projeto está em `^7.4.4`). `npm install` ainda falha com ERESOLVE. O build do Lovable passa porque usa **bun**, permissivo com peer dependency — o problema só aparece para quem clona e roda `npm install`, que é o que o README documenta.
11. **`owner-decision-cron` e as `notify-*` sem guarda** 🟡 — qualquer um dispara e-mail/push em massa para proprietários. Custo, reputação de domínio e incômodo.
12. **`hostex-sync?force=1` pula o token** 🟡 — `index.ts:89-97`.
13. **Higiene** 🟡 — 75 `console.log`; `index.html:2` `lang="en"`; sem `viewport-fit=cover`; 132 botões só de ícone e 25 `aria-label`; 34 "Carregando" soltos.
14. **Arquivos gigantes** 🟡 — `AdminManutencoesLista.tsx` **2920**, `CobrancaDetalhes.tsx` 1804, `AtualizacaoAnuncio.tsx` 1791, `TicketDetalhes.tsx` 1284, `PlanoPerformanceSection.tsx` 1268.

---

## 9. Trabalhando neste repo

```bash
npm install --legacy-peer-deps   # obrigatório hoje, ver §8.10
npm run dev                      # Vite em :8080
npm run build                    # ~1min05
npm run lint
```

Sem suíte de testes. Validação é manual, no navegador e no aparelho.

**Fluxo com o Lovable:** editar aqui → commit → push → o Lovable puxa. Editar no Lovable → ele empurra pro GitHub → `git pull` aqui.

> ⚠️ **Sempre `git fetch && git status` antes de começar.** Este repositório já ficou 2.532 commits atrasado sem que o `git status` avisasse (os dados do remoto estavam em cache). Trabalhar sobre um snapshot velho produz análise errada.

**Não editar:** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`.

**Pendência:** `appId` do `capacitor.config.ts` divergente entre local e remoto — ver ROADMAP, Onda 5.
