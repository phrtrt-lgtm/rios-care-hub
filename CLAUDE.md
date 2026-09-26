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

**Quadros da lista da equipe** (`/admin/manutencoes-lista`, desde 2026-09-22): Em Progresso · **Infiltração** · **Stand-by** · Aguardando Envio · Cobranças Vencidas · Cobranças Pendentes. "Quadro" não é coluna — é derivado de dois campos, porque um item pode ser as duas coisas: **Infiltração** = label de serviço contém `infiltracao`; **Stand-by** = `tickets.on_hold` (coluna criada em 2026-09-22, invisível ao proprietário; já no `types.ts`). Infiltração vence Stand-by. Regra e seletor em `src/lib/maintenanceBoard.ts`; o campo virtual `board` é traduzido em `handleUpdateItem` para `on_hold` + `service_type`.

**Enviar ao proprietário** (desde 2026-09-25) está todo em `enviarAoProprietario()`, dentro de `AdminManutencoesLista.tsx`. A função faz, em ordem:
1. cria a cobrança como `sent`, ou reaproveita a cobrança aberta;
2. copia os anexos;
3. conclui o ticket;
4. manda o e-mail. O WhatsApp sai pelo trigger.

Dois caminhos usam essa mesma função: o status "Enviar ao Proprietário" de uma linha e o botão em lote "Enviar ao proprietário (N)", que aparece com a seleção (a caixa no cabeçalho marca o grupo inteiro). O lote envia um item por vez, pede confirmação antes e, se um falhar, os outros seguem. **Ao mudar o envio, mude na função**, não em um dos dois caminhos. A versão de celular ainda não tem seleção.

### 3.2 Cobranças
`charges`, `charge_payments`, `charge_messages`, `charge_attachments`, `recurring_charges`, `recurring_charge_runs`, `owner_credits`, `owner_credit_applications`.

**Janela de 7 dias:** emissão → 7 dias para pagar ou contestar → pagamento, contestação ou timeout → liquidação ou **offset (débito em reserva)** (`debit-reserve/`, `debit-reserve-now/`, `reserve-debit-revert-alert/`).

**Score do proprietário** (0–100, default 50): antecipado **+5**, em dia **+1**, atraso **−15**, débito em reserva **−30** (`mercadopago-webhook/index.ts` e `src/hooks/useOwnerScore.ts`). Estrelas: ≥90 / ≥75 / ≥60 / ≥40. Histórico em `owner_payment_scores`.

> ⚠️ **Regra de negócio que não está no código — confirmada pelo gestor em 2026-09-20.**
> Nem toda cobrança com status de paga foi recebida em dinheiro. O admin marca como paga manualmente em dois casos legítimos:
> 1. **Acerto por fora do Mercado Pago** — PIX direto, transferência.
> 2. **Perdão da cobrança** pela gestão, com ou sem aporte registrado em `management_contribution_cents`.
>
> Quando o aporte cobre 100% do valor, o proprietário não deve nada e **é correto não haver registro em `charge_payments`**.
>
> Consequência prática: **ausência de pagamento no Mercado Pago não significa inadimplência**, e o status de paga não distingue "recebemos" de "perdoamos". Nenhum relatório ou automação deve tratar as duas coisas como iguais. Ver `ROADMAP.md` item 1.11.

**WhatsApp de cobrança (desde 2026-09-23, opt-in).** Controles só para admin na lista de manutenções, desde 2026-09-25 (`src/components/maintenance/WhatsappAcaoLinha.tsx`):
- no quadro "Aguardando Envio", o switch do proprietário;
- em "Cobranças Pendentes/Vencidas", o botão de enviar/reenviar, sempre com confirmação.

Switch `profiles.notificar_whatsapp` em `/admin/gerenciar-usuarios` (só proprietário, só com `phone` preenchido — `phone` é o número de WhatsApp; o proprietário não altera o próprio switch, está no trigger anti-escalação). Disparo no backend: trigger `trg_notificar_cobranca_whatsapp` em `charges`, com dois casos:
- **Virou cobrança:** nasce fora do rascunho ou sai do rascunho para `sent`/`pendente`, ou já sai paga por aporte de 100%.
- **Ficou de graça** (desde 2026-09-25): uma cobrança em aberto (enviada, pendente ou vencida) passa a paga porque o aporte cobriu o valor. Vai com `reenviar=true`, porque o WhatsApp de "enviada" pode já ter saído. O "valor a pagar" da mensagem sai R$ 0,00.

O trigger escuta `status`, `management_contribution_cents` e `amount_cents`. Isso é necessário porque igualar o aporte só altera o aporte, e quem troca o status é o BEFORE `auto_pay_full_contribution_charges`. Migration: `20260925120000_whatsapp_cobranca_perdoada.sql`. Chama `notificar-cobranca` via `pg_net` com token do Vault (`notificar_cobranca_token`, conferido por `verificar_token_interno`, só service role). A function chama a função central de WhatsApp de outro projeto (`gxsdefecwamziirfbzlk…/notificar`, header `x-rios-key` = secret `NOTIFICAR_KEY`) e grava `charges.whatsapp_status` / `_enviado_em` / `_message_id` / `_erro`. Nunca bloqueia a cobrança. Migration: `supabase/migrations/20260923120000_notificar_cobranca_whatsapp.sql`.

**Lembrete de atraso por WhatsApp (desde 2026-09-25).** Usa o modelo `cobranca_atraso_proprietario`, que precisa estar aprovado no Meta.

- **Um por proprietário:** cada mensagem resume todas as cobranças dele em atraso (quantidade, total e vencimento mais antigo). Nunca uma mensagem por cobrança: em 25/09 a Claudia tinha 24 vencidas.
- **Onde está a regra:** a definição única de "em atraso" é a função SQL `cobrancas_em_atraso()`. Ela deixa de fora contestada, comprovante em análise, débito em reserva e cobrança sem saldo.
- **Envio:** a `notificar-cobranca` recebe `{tipo:"atraso", proprietario_id}` (enviado pelo admin, pelo botão ⏰ em "Cobranças Vencidas" ou pelo lote da lista) e `{lote_atraso:true}` (enviado pelo cron).
- **Automático:** o cron `whatsapp-lembrete-atraso` roda todo dia às 10h e chama `disparar_lembretes_atraso_whatsapp()`. A configuração fica em `whatsapp_lembrete_config`, que nasce **desligada** e só admin altera, pelo botão "Lembrete de atraso" na lista. Ela define ativo, intervalo, máximo por cobrança e proprietários por dia.
- **Registro:** o resultado de cada lembrete fica em `charges.whatsapp_lembrete_*`.
- Migration: `20260925150000_whatsapp_lembrete_atraso.sql`.

> ⚠️ Desde 2026-09-23 `auto_pay_full_contribution_charges` **ignora rascunhos**: aporte ≥ valor só auto-paga quando a cobrança sai do rascunho. Antes auto-pagava durante a edição.

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

### 3.11 Painel da equipe (`/painel`)
Reorganizado em 2026-09-25 (`ROADMAP.md` item 4.6). A página tem esta ordem:

1. resumo com 4 números (`src/components/painel/PainelResumo.tsx`);
2. avisos e votações;
3. **Operações**: Manutenções, Cobranças, Chamados e Vistorias em grade 2×2, com o lembrete de cobrança de hóspede logo abaixo;
4. **Atalhos**: um bloco só, em 5 grupos (`src/components/painel/PainelAtalhos.tsx`).

- **Cada número do topo usa a mesma definição da caixa correspondente.** Ao mudar uma, mude a outra.
- **"Vencida" vem de `src/lib/vencimento.ts`** (`estaVencida` e `diasParaVencer`): a cobrança só vence depois do dia do vencimento, e a data é lida como dia local. Não use `new Date(due_date)`: isso lê a data como meia-noite UTC, e a cobrança aparece vencida desde as 21h da véspera.
- **As caixas não têm teto de consulta.** Antes, o `.limit(15)` e o `.limit(50)` apareciam como se fossem o total. Expandir mostra tudo, com rolagem dentro da caixa. A exceção é Vistorias, que é um feed das 15 mais recentes, e o selo diz "recentes".
- **Lembrete de hóspede:** vem de `useGuestCharges`, com a chave `["painel","guest-charges"]`, compartilhada com o resumo. Os grupos são:
  - pronta: 14 dias ou mais desde o check-out;
  - em breve;
  - sem data de check-out.

  Os itens abrem no `DetailSheet`, sem sair do painel.
- **Atalho novo: confira a permissão em dois lugares.** Um é o `allowedRoles` da rota em `App.tsx`. O outro é o `useEffect` da própria página, que às vezes é mais restrito:
  - `TodosTickets`, `Propriedades` e `NovoAlerta` aceitam só admin/agent;
  - `NovoTicketInterno` aceita só admin.

  Se a página recusar, o atalho devolve a pessoa ao início sem aviso.
- **`/todos-tickets` aceita `?priority=` e `?status=`.** `status=abertos` significa "nem concluído nem cancelado". Os filtros são aplicados uma vez, a partir de filtros limpos, e depois saem da URL.

**Casco visual compartilhado (desde 2026-09-25).** As duas páginas de painel (`/painel` e `/minha-caixa`) usam as mesmas peças, em `src/components/painel/`:
- `PainelHeader` — barra fixa do topo (logo, ação principal, menu "Mais", busca, calendário, notificações e o diálogo de perfil). Não repita o cabeçalho na página.
- `PainelHero` — data, saudação pela hora ("Bom dia, Pedro") e subtítulo.
- `Indicador` — número de resumo; `PainelResumo` (equipe) e `OwnerResumo` (proprietário) são feitos dele. `OwnerResumo` segue a mesma regra do painel: cada número usa a definição da caixa correspondente, sem o teto de consulta. As caixas do proprietário também não têm teto (desde 2026-09-26): o `.limit(10)` em `OwnerChargesPreview` escondia a 11ª cobrança, e o total que o proprietário via ficava menor que o de `/gerenciar-cobrancas`. Isso aconteceu com Rosana, Aroldo e Claudia. A lista rola dentro da caixa.
- `CaixaOperacao` + `GrupoCaixa` + `LinhaCaixa` + `BotaoLinha` + `SeloContagem` + `CaixaVazia` + `CaixaCarregando` — o cartão padrão das caixas (cabeçalho com ícone tingido, grupos com ponto colorido, linhas clicáveis). Todas as caixas das duas páginas usam esse casco; ao criar uma caixa nova, comece por ele.
- `tons.ts` — o mapa de tons semânticos (`TOM[tom].caixa/ponto/texto/borda/fundo`), com as classes escritas por extenso para o Tailwind gerá-las.
- `TituloSecao` — título de seção com barra de acento.

A página do proprietário ganhou a ordem: saudação → números → avisos → curadoria/contrato/propostas → imóveis (`OwnerPropertiesSection`, que carrega o próprio título) → grade 2/3 + 1/3 (cobranças, comissões, manutenções, chamados | score, `OwnerAjuda`). Os dois banners de guia e os botões de relatório só de desktop viraram a caixa `OwnerAjuda`.

---

## 4. Regras invioláveis — e o status real de cada uma

| # | Regra | Status hoje |
|---|---|---|
| 1 | Só tokens semânticos, nunca cor crua do Tailwind. Exceção: tutorial e escala do score | ❌ **804 ocorrências** fora de `ui/` (os tokens agora existem — ver §5, não há mais desculpa) |
| 2 | `EmptyState` e `SectionSkeleton` para vazio/carregamento. Sem emoji, sem "Carregando..." solto | ⚠️ **Os dois existem desde setembro/2026** em `src/components/ui/empty-state.tsx` e `src/components/ui/section-skeleton.tsx` (a lista mobile de manutenções já usa). Falta adotar nas telas antigas: ainda há "Carregando..." solto, inclusive na tabela desktop de manutenções |
| 3 | Nunca criar prazo/contador de SLA em ticket | ⚠️ **`/todos-tickets` ainda mostra** coluna "SLA" com "Expirado", contagem regressiva e ordenação "SLA (vencendo antes)" (`TodosTickets.tsx:289`, `:502`, `:695`). Outras 4 telas só **ordenam** por `sla_due_at`, sem exibir: `ChamadosKanbanPreview`, `TicketList`, `AdminChamadosKanban`, `MeusChamados` |
| 4 | Nome de anexo anonimizado ("Imagem", "PDF") | ❌ `file_name` real ainda exibido (`AttachmentBubble.tsx`) |
| 5 | Proprietário não vê calendário de reservas | ✅ `/calendario-reservas` redireciona para área da equipe (`App.tsx:527`) |
| 6 | Janela de 7 dias; penalidade só depois | ✅ |
| 7 | Papel em tabela separada, checado por `security definer` | ❌ **`role` é coluna de `profiles`**; não existe `user_roles` em 171 migrations |
| 8 | Voltar de lista usa `replace: true` | ⚠️ parcial |
| 9 | Não mexer em autogerados | `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` |
| 10 | Produto em pt-BR | ✅ na UI e `index.html` (`lang="pt-BR"` desde 2026-09-25) |

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

**Existem desde setembro/2026:** `src/components/ui/empty-state.tsx` (`EmptyState`) e `src/components/ui/section-skeleton.tsx` (`SectionSkeleton`). Use-os em vez de "Carregando..." solto ou vazio improvisado.

**Fonte:** Inter, carregada do Google Fonts em `index.html` com `display=swap` e definida como `fontFamily.sans` em `tailwind.config.ts` (desde 2026-09-25). Sem rede, cai para a fonte do sistema.

**Casco do painel:** `src/components/painel/` (ver §3.11) — cabeçalho, saudação, indicadores e caixas padronizadas das páginas `/painel` e `/minha-caixa`.

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
| ✅ Corrigidas em 2026-09-18 | `hostex-sync` (exige token de cron ou JWT de equipe), `debit-reserve`, `debit-reserve-now`, `credit-manual` (exigem papel via `exigirPapel`) |
| ❌ Sem guarda nenhuma | `create-curation-pix`, `save-curation-selection`, `curation-access`, `send-push`, `notify-ticket`, `notify-owner-decision`, `notify-curation-paid`, `notify-booking-commission`, `notify-booking-commission-paid`, `migrate-attachments`, `owner-decision-cron`, `generate-service-summary` — ver ROADMAP 1.5, travado à espera de um secret |
| Webhook externo (ok não ter JWT, mas ver §8.9) | `mercadopago-webhook` |

A URL do projeto Supabase é pública por construção — está no bundle que todo visitante baixa. "Ninguém sabe o endereço" não é proteção.

### ⚠️ `verify_jwt = true` é uma barreira fraca

Ele exige apenas **um JWT válido** — e a chave publicável (`VITE_SUPABASE_PUBLISHABLE_KEY`) é um JWT válido, presente no bundle de todo visitante. Ou seja, `verify_jwt = true` filtra quem não manda header nenhum, mas **não distingue um proprietário de um admin, nem um usuário de um anônimo com a chave pública**.

Toda function que faz operação privilegiada precisa de checagem **no código**, lendo o usuário do token e conferindo o papel. Use o helper `supabase/functions/_shared/auth-guard.ts` (`exigirPapel`), aplicado hoje em `debit-reserve`, `debit-reserve-now`, `credit-manual` e `hostex-sync`. Funções chamadas só de servidor para servidor precisam de segredo compartilhado, não de JWT.

### ⚠️ O repositório não mostra todas as functions publicadas

O painel do Lovable Cloud lista mais functions publicadas do que existem em `supabase/functions/`. Depois de apagar `admin-reset-password` e `seed-test-lead` (2026-09-18), sobram **três órfãs**: **`create-user`**, **`process-all-videos`**, **`process-video`** — todas exigem JWT (sondadas em 2026-09-18), mas o código não está no Git e não aparece em revisão nenhuma. Ver `ROADMAP.md` item 1.9.

O "View code" do painel **não serve** para órfã: ele aponta para o caminho no repositório, que não existe.

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
13. **Higiene** 🟡 — 75 `console.log`; 132 botões só de ícone e 25 `aria-label`; 34 "Carregando" soltos. (`lang="pt-BR"` e `viewport-fit=cover` corrigidos em 2026-09-25.)
14. **Arquivos gigantes** 🟡 — `AdminManutencoesLista.tsx` **2920**, `CobrancaDetalhes.tsx` 1804, `AtualizacaoAnuncio.tsx` 1791, `TicketDetalhes.tsx` 1284, `PlanoPerformanceSection.tsx` 1268.
15. **Anexos listáveis sem login** 🔴 — o bucket `attachments` é público e tem a policy `Anyone can view attachments`, para o papel `public`. Com a chave anônima, qualquer pessoa lista e baixa os **6.002 arquivos**. Confirmado em `pg_policies` em 2026-09-25. Não basta tornar o bucket privado: o app usa `getPublicUrl` e grava URL pública em `ticket_attachments.file_url`. Ver `ROADMAP.md` 1.14.

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
