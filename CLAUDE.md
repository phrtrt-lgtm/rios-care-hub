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

- **Proprietário:** `/minha-caixa`, `/resultados` (também admin e agent, ver §3.12), `/minhas-cobrancas`, `/novo-ticket`, `/meus-chamados`, `/vistorias`, `/minha-curadoria`, `/minhas-comissoes-booking`, `/relatorio-financeiro`, `/contrato/:id`, `/bem-vindo`
- **Equipe:** `/painel`, `/todos-tickets`, `/propriedades`, `/gerenciar-cobrancas`, `/admin/vistorias*`, `/admin/chamados`, `/admin/manutencoes*`, `/booking-comissoes`, `/admin/central-hostex`, `/admin/contratos*`, `/admin/curadorias`, `/ajustes` (§3.13) e `/compras` (§3.14), as duas também para `cleaner`, `/tarefas-rua` (§3.15), `/novos-imoveis` (§3.19)
- **Só admin:** `/configuracao-email`, `/configuracao-ia`, `/admin/gerenciar-usuarios`, `/admin/cadastrar-equipe`, `/admin/vistorias/configuracoes`
- **`cleaner`:** `/faxineira`, `/rotina-profissional`, `/protocolo-trabalho`, `/ajustes`, `/compras`

> `/calendario-reservas` **redireciona para `/admin/central-hostex`** (`src/App.tsx:527`), área da equipe. A regra "proprietário não vê calendário de reservas" está respeitada.

---

## 3. Módulos

### 3.1 Chamados / Manutenções — modelo híbrido, atenção
`tickets` é a tabela central e ganhou **dezenas de colunas** de manutenção: `kind`, `essential`, `cost_responsible`, `split_owner_percent`, `owner_decision`, `owner_action_due_at`, `charge_draft_*`, `service_provider_id`, `scheduled_at`, `maintenance_ticket_id`.

Manutenção hoje vive nos **dois** lados: `useMaintenances.ts:46` consulta `charges`, e `:179`/`:281` consultam `tickets`. Ao mexer aqui, confirme de qual lado vem cada campo.

Fluxo essencial vs estrutural: item `essential` pode ser executado de imediato; estrutural gera decisão do proprietário com prazo em `owner_action_due_at`, lembrado por `owner-decision-cron`.

> ⚠️ `tickets` tem `sla_due_at` e `first_response_at` — resíduo. A regra nº 3 proíbe SLA; não construa UI sobre essas colunas.

**Quadros da lista da equipe** (`/admin/manutencoes-lista`, desde 2026-09-22): Em Progresso · **Novos imóveis** (desde 2026-10-27, §3.19) · **Infiltração** · **Stand-by** · Em debate · Aguardando Envio · Cobranças Vencidas · Cobranças Pendentes. "Quadro" não é coluna — é derivado de dois campos, porque um item pode ser as duas coisas: **Infiltração** = label de serviço contém `infiltracao`; **Stand-by** = `tickets.on_hold` (coluna criada em 2026-09-22, invisível ao proprietário; já no `types.ts`). Infiltração vence Stand-by. Regra e seletor em `src/lib/maintenanceBoard.ts`; o campo virtual `board` é traduzido em `handleUpdateItem` para `on_hold` + `service_type`. **Novos imóveis** vem do imóvel, não do ticket: manutenção (aberta ou feita e não enviada) de imóvel com viabilização aberta vai para lá e vence os outros quadros de manutenção (`emNovoImovel` em `groupedItems`, via `useImoveisEmViabilizacao`). **Compra de imóvel novo não entra na lista** (desde 2026-10-28, pedido do gestor): item com `tickets.natureza = compra` fica só em `/novos-imoveis` (§3.19), para o funcionário de manutenção ver só manutenção. A consulta da lista, a caixa Manutenções do painel e o número do resumo, o kanban e a página de concluídas filtram `natureza = manutencao`; o arquivo, o aviso de cobrança de hóspede e o calendário não filtram.

**Enviar ao proprietário** (desde 2026-09-25) está todo em `enviarAoProprietario()`, em `src/lib/manutencaoLista.ts` (até 2026-10-27 vivia dentro de `AdminManutencoesLista.tsx`; saiu de lá junto com a edição em linha, `salvarCampoManutencao`, para a página de imóveis novos usar as mesmas funções). A função faz, em ordem:
1. cria a cobrança como `sent`, ou reaproveita a cobrança aberta;
2. copia os anexos;
3. conclui o ticket;
4. manda o e-mail. O WhatsApp sai pelo trigger.

Quatro caminhos usam essa mesma função: o status "Enviar ao Proprietário" de uma linha, o botão em lote "Enviar ao proprietário (N)", que aparece na barra de ações da seleção (a caixa no cabeçalho marca o grupo inteiro), e, em `/novos-imoveis`, o botão do item e o "Enviar os N ao proprietário" do cartão. O lote envia um item por vez, pede confirmação antes e, se um falhar, os outros seguem. **Ao mudar o envio, mude na função**, não em um dos dois caminhos. A versão de celular ainda não tem seleção.

**Cobrança em dobro (corrigido em 2026-10-01).** Enviar ao proprietário só reaproveitava cobrança **aberta**; se a do ticket já estava paga (em geral por aporte de 100%, que até 2026-09-23 auto-pagava ainda no rascunho), nascia uma segunda idêntica. Havia 18 pares; o lançamento mais antigo de cada um foi arquivado. Agora os três caminhos que criam cobrança a partir de um ticket (`enviarAoProprietario`, `SendToChargeButton`, concluir em `MaintenanceKanbanPreview`) chamam antes `buscarCobrancaJaLancada` (`src/lib/cobrancaDuplicada.ts`): mesmo ticket, mesmo valor, não rascunho e não arquivada = não cria outra. Valor diferente continua permitido. Caminho novo que crie cobrança de ticket tem que chamar a mesma função.

**Debate com o proprietário (desde 2026-10-01).** Uma manutenção aberta pode virar chamado para o proprietário opinar e depois voltar. Não há cópia: o mesmo ticket troca `ticket_type` de `manutencao` para `duvida` (o proprietário vê em Meus chamados) e `kind = "maintenance"` marca a origem. Na lista ele vai para o quadro **Em debate com o proprietário** (`kind = maintenance` e `ticket_type ≠ manutencao`); o botão de voltar devolve `ticket_type = "manutencao"`. Tudo em `debateMutation` / `voltarManutencaoMutation` (`AdminManutencoesLista.tsx`) e `DebateDialog.tsx`. Ao abrir:
- a mensagem digitada vai como mensagem pública por `create-ticket-message`, que avisa o proprietário;
- anexos presos a nota interna ou sem mensagem passam para essa mensagem, senão ele não os veria;
- `cost_responsible` `pending`/`guest` esconde o ticket do proprietário, então vira `null` durante o debate (fica anotado em nota interna) e volta como `pending`.

Os dois botões existem no desktop (`GroupRow`) e no celular (`MobileMaintenanceList`); os diálogos são um bloco só (`dialogosDebate`).

**Baixar anexos e cobrança de hóspede feita (desde 2026-10-01).**
- Download em `.zip` por `src/lib/baixarAnexos.ts` (`baixarAnexosEmZip`): uma pasta por item, nomeada `Check-out aaaa-mm-dd - Imóvel - Dano`, com os arquivos `anexo-01.jpg`… (regra nº 4). Usado no botão da coluna Anexos, no "Baixar anexos (N)" da barra de seleção, no celular e no aviso de hóspede do painel. O navegador não gera `.rar`; o WinRAR abre o `.zip`.
- Manutenção com `cost_responsible = "guest"` marcada como **Feito** ganha `archived_at`: sai da lista (vai para `/admin/manutencoes-arquivo`) e continua no aviso do painel, porque `useGuestCharges` não olha `archived_at`. Só sai do painel pelo botão "Cobrada" (`guest_charge_dismissed_at`). Não filtre `archived_at` naquele hook.
- A consulta da lista é uma só: cobranças embutidas no ticket e anti-join `reais:charges(id)` para não trazer as concluídas já cobradas (eram 420 tickets e 370 KB; ficaram ~36 linhas). Índice `idx_charges_ticket_id`.

**Colunas "Hoje" e "Próx. check-out" (desde 2026-10-17, pedido do gestor)**, logo depois de Imóvel, **ordenáveis** (dentro de cada grupo; "Hoje" crescente põe os livres primeiro): `CelulaEstadoHoje` e `CelulaCheckout` (§3.15), ordem por `ordemEstado`/`ordemCheckout` (`useJanelaImoveis.ts`). No celular vira uma linha embaixo do nome do imóvel. A tabela tem **15 colunas**; ao mexer, confira os `colSpan`. A aba **Compras** espelha `/compras` (§3.14).

**Estrutura da lista (desde 2026-09-28).** `AdminManutencoesLista.tsx` ficou só com o componente principal (~2.000 linhas). O resto está em `src/components/maintenance/`: `listaTipos.ts` (tipos, `GROUPS` com tom/ponto/`cobranca`, constantes), `EditableCell.tsx` (`SortableHeader` + célula editável), `GroupRow.tsx` (cabeçalho do grupo com contagem e total + linhas), `LoteDialogs.tsx` (envio e lembrete em lote), `VistoriasTable.tsx`. Na tela:
- três abas no cabeçalho — Manutenções · Vistorias · Débitos em reserva — em vez de três tabelas empilhadas;
- pílulas de quadro (Todos + os 6 grupos) e filtro por imóvel, além da busca; a aba fica em `localStorage` (`manutencoes-lista:aba`); os grupos abrem **todos fechados** a cada visita (desde 2026-10-01, pedido do gestor) e não são mais lembrados;
- as duas primeiras colunas (seleção e nome) são fixas na rolagem horizontal (`sticky` com fundo opaco), e o cabeçalho do grupo também;
- a barra de ações da seleção (Arquivar, Enviar ao proprietário, Lembrete de atraso) é fixa no rodapé;
- no celular (`MobileMaintenanceList`, desde 2026-10-01): as mesmas pílulas de quadro, total por grupo, grupos abertos compartilhados com o desktop, seletor de responsável pelo custo e barra inferior de navegação. Vistorias, débitos em reserva e seleção em lote continuam só no desktop;
- a contagem de anexos vem embutida na consulta (`ticket_attachments(count)`, `charge_attachments(count)`); antes eram baixadas todas as linhas de anexo (2.700) só para contar. As duas consultas têm `staleTime` de 30 s e `useIsMobile` lê a largura já na montagem, para o celular não renderizar a versão desktop primeiro.

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
`hostex_properties`, `hostex_reservations`, `hostex_listing_calendar`, `hostex_sync_log`. Sincronização por `hostex-sync` (cron `hostex-sync-6h` + manual) e `hostex-proxy`. Central em `/admin/central-hostex`.

> ⚠️ **A coleta ficou parada de 2026-07-03 a 2026-10-04.** O secret `HOSTEX_API_KEY` estava inválido: a Hostex responde HTTP 200 com `{"error_code":401,"error_msg":"Invalid access token."}` no corpo, e a function tratava isso como lista vazia — o log dizia `ok` com 0 reservas a cada 6 h. O gestor trocou a chave em 2026-10-04 e a rodada seguinte trouxe 1.271 reservas (884 → 1.488 no banco, julho a setembro recuperados).
>
> - **"Log `ok`" não prova coleta em dia**: confira `reservations_upserted > 0` (é o que `useColetaHostex` faz).
> - **Pendente: redeploy de `hostex-sync` e `hostex-proxy`** (e deploy de `pricelabs-sync`, §3.12) pelo agente do Lovable. A correção está no repositório desde 2026-10-03 (`conferirRespostaHostex`: erro no corpo vira erro de verdade no `hostex_sync_log`; `hostex-proxy` exige papel de equipe), mas em 2026-10-04 a versão publicada ainda era a antiga — o proxy respondia `action_not_allowed` a uma chamada só com a chave pública, em vez de 401.
> - **Reservas antes de março de 2026 não existem na Hostex** (a integração começou em fevereiro/março). Para a página de resultados elas vêm dos relatórios financeiros — ver §3.12, `reservas_unificadas()`.
> - **[DÚVIDA] `start_date`/`end_date` não restringem como o código supõe**: a rodada de 2026-10-04, ainda na versão antiga (30 dias para trás), atualizou reservas com check-in desde abril e trouxe uma de julho de 2027. Não conte com a janela para limitar o volume.
> - Três propriedades da Hostex sem imóvel correspondente no portal (`GIOVANI1`, `GIOVANI2`, `GIOVANI3`): as reservas delas ficam com `property_id` nulo até o imóvel existir com o mesmo nome.

`hostex-sync` desde 2026-10-03: janela de reservas de 45 dias para trás (parâmetro `past_days`, até 400) a 365 à frente; calendário de preços (`/listings/calendar`, 60 dias) só uma vez por dia (pula se a última coleta tem menos de 20 h; `?calendar=1` força); vínculo `id_hostex → property_id` preservado quando o nome deixa de casar. `hostex-proxy` passou a exigir papel de equipe (`exigirPapel`): antes devolvia reservas com nome de hóspede a qualquer um com a chave pública.

### 3.7 Contratos
`contracts`, `contract_templates`, `contract_events`, `contract_owner_submissions`, `contract_submission_attachments`. Admin em `/admin/contratos`, assinatura do proprietário em `/contrato/:id`.

### 3.8 Fichas de imóvel e captação
`property_files`, `property_file_versions`, `property_intake_submissions`, `property_members`. Ficha pública `/cadastro-imovel` → `submit-property-intake`. Edição em `/admin/fichas-imoveis`, `/atualizacao-anuncio`. Parsing por IA: `parse-ficha-anuncio`, `bulk-edit-fichas`.

**`/cadastro-imovel` é a landing dos anúncios (desde 2026-10-14, pedido do gestor).** Feita para converter e **sem rolagem de página**: a primeira versão (longa, com seções) foi descartada no mesmo dia porque o formulário ficava lá embaixo; a segunda ainda rolava um pouco. Hoje (`src/pages/CadastroImovel.tsx`):
- **Desktop (≥ 1024 px, `useTelaLarga`)**: `h-dvh` + `overflow-hidden`; painel da marca à esquerda e formulário à direita, lado a lado, cabendo na tela (conferido em 1366×768, 1440×900 e 1920×1080; acima de 920 px de altura o par fica centralizado em vez de esticar). Cada coluna rola por dentro se a tela for baixa demais, nunca a página. Sem rodapé: contatos ficam no pé do painel.
- **Celular (< 1024 px)**: `TelasMoveis`, duas telas lado a lado do tamanho da janela (`snap-x`), com pontinhos embaixo: tela 1 = painel da marca com o botão "Cadastrar meu imóvel"; tela 2 = formulário com o link "Ver o que a RIOS inclui". `?tela=cadastro` abre direto na segunda (links de anúncio). Cabe sem rolagem em 390×700; em tela mais baixa a própria tela rola. **`autoFocus` só no desktop**: no celular ele puxava o trilho para a tela do formulário antes da hora.
- **`PainelMarca`** (`src/components/captacao/LandingCaptacao.tsx`): fundo com o **reel dos imóveis** (desde 2026-10-14, pedido do gestor): `public/videos/captacao/imoveis-640.mp4` no desktop e `imoveis-432.mp4` no celular (escolha por `useTelaLarga`), ~29 s, nove trechos, **só a praia do Forte e o apartamento decorado pela RIOS** (reel "Tour Completo" vertical, com o logo cortado no 4:5, e os clipes da curadoria: sala com vista, cozinha, sala de jantar, quarto, varanda) — regra do gestor: nada de imóvel que a RIOS não decorou, nem festa, fechadura ou apresentador. 4:5, sem áudio, ~2,7 MB e ~1,2 MB; `imoveis-poster.jpg` com "reduzir movimento". Montagem reproduzível em `motion/captacao-reel/monta-reel.py` (ffmpeg; os vídeos de origem ficam em `C:/Users/pc/Downloads`, fora do repositório). **O vídeo é o protagonista**: tinta de 20 % no todo e faixas escuras só onde há texto (topo 62 %, base 46 %); título, subtítulo e números levam `text-shadow` na cor `secondary`, e o vidro da vitrine é `bg-secondary/60` com blur. A primeira sombra (95 %/75 %/40 % no todo) escondia o imóvel e foi trocada no mesmo dia. Título, **vitrine** que roda sozinha (8 diferenciais e 3 resultados, **3 s** cada — em 4,5 s parecia parada —, barra de progresso CSS `vitrine-progresso` que pausa junto com o relógio ao passar o mouse ou pelo botão; sem movimento, só navegação manual), **números que contam** ao aparecer (`useContagem`, 0,9 s) e a linha de cidades/comissões.
- **`FormularioCaptacao`** (`FormularioCaptacao.tsx`): o mesmo pré-cadastro em **três passos** curtos (dados · imóvel · detalhes), validação por passo, Enter avança, "Voltar" preserva o que foi digitado; só animação de entrada entre passos (com saída, em aba de fundo o passo novo nunca aparecia). O envio é o de sempre: `submit-property-intake` + login automático + `MetaPixel`, na página.
- **Todo o texto, números, comissões e links estão em `conteudo.ts` e espelham o site rioshospedagens.com.br** (lido em 2026-10-14): mudou lá, mude ali. O simulador de receita do site não foi reproduzido (a fórmula não está exposta); a página aponta para ele.
- `/cadastro-imovel/obrigado` tem o link para o site.

### 3.9 Relatórios financeiros
`financial_reports`, `financial_report_audit_log`. `/relatorio-financeiro/:id` (proprietário) e `/admin/relatorios-financeiros`. Envio por `send-report-email`.

### 3.10 Chat, notificações, IA
Chat por contexto (`ticket_messages`, `charge_messages`, `curadoria_messages`, `booking_commission_messages`, `team_chat_messages`) + `message_read_receipts` e `notify-mentions` (menções com `mentioned_user_ids`).
IA: `ai_settings`, `ai_templates`, `ai_prompt_versions`, `ai_usage_logs`; `summarize-conversation`, `transcribe-audio`. **O assistente do portal é `ia-agente` (§3.20); `ai-consulta` e `ai-assistant` estão desligadas.**

**Conversas (desde 2026-09-28).** Os cinco chats (chamado inline em `TicketDetalhes`, `MaintenanceChatDialog`, `ChargeChatDialog`, cobrança inline em `CobrancaDetalhes`, `BookingCommissionChatDialog`) e o chat da equipe (`TeamChatWidget`) usam o kit `src/components/chat/` e renderizam o corpo por `CorpoMensagem` (`renderizarCorpo`): menção `@[Nome](uuid)` vira nome clicável, `**texto**` vira negrito, emoji de abertura some. `ChatDateDivider` lê a chave do dia como dia local (antes mostrava "Ontem" para hoje). A rolagem vai até a última mensagem por uma âncora no fim da lista, não por `ref` no `ScrollArea`. Voto de equipe em proposta: `VotacaoDetalhes` libera o formulário para membro da equipe quando `target_audience = "team"` (antes era beco sem saída). Link de menção em chamado corrigido em `notify-mentions` (`/ticket-detalhes/`), **precisa de redeploy**.

**Chat da lista de manutenções (corrigido em 2026-10-13).** O gestor escrevia no `MaintenanceChatDialog` e a mensagem "não ia e não ficava". Eram três coisas juntas:
- `create-ticket-message` recusava mensagem em chamado `concluido`/`cancelado` para todo mundo, e a lista é quase só de concluídos (427 de 448: enviar ao proprietário conclui o ticket). Agora a equipe escreve em qualquer status; o proprietário continua barrado, com a mensagem em pt-BR. **Precisa de redeploy pelo Lovable.**
- `useMaintenanceChat.sendMessage` mandava em segundo plano e, no erro, só tirava a bolha provisória, sem aviso. Agora espera a resposta, troca a bolha "Enviando…" pela mensagem real e avisa por toast (`src/lib/erroFunction.ts` lê o `{ error }` do corpo da function, porque `FunctionsHttpError.message` é genérico). O campo só limpa quando gravou.
- `ticket_messages` nunca esteve na publicação do realtime (`pg_publication_tables`), embora o hook e `TicketDetalhes` assinassem INSERT nela: a bolha ficava "Enviando…" até reabrir. Migration `20261013120000_realtime_ticket_messages.sql`, já aplicada.
- De quebra: Enter envia (Shift+Enter quebra linha) via `enterEnvia` no `MentionInput`, como nos outros chats; o redesign tinha deixado só Ctrl+Enter. Comentários de vistoria seguem com Ctrl+Enter.

**PDF "não autorizado" (corrigido em 2026-10-14).** Anexo de manutenção/cobrança é servido pela function `serve-attachment`, que exige o token da sessão. Qualquer link direto a ela (`<a href>`, `window.open`, `<object data>`) chega sem o token e recebe 401, que o visualizador mostra como "Unauthorized". Foto e vídeo nunca sofreram porque passam pelo `useMediaCache` (fetch com token → blob); PDF e outros arquivos abriam pela URL crua. Agora: `MediaGallery` carrega PDF pelo mesmo cache e mostra em `<iframe>` com o blob (cai na URL crua se o fetch falhar); `ManutencaoDetalhes` abre PDF/arquivo na galeria em vez de link; `CobrancaDetalhes` põe PDF/arquivo do chat na galeria e baixa os arquivos da cobrança com token (`src/lib/abrirAnexo.ts`: `buscarAnexoAutenticado`, `abrirAnexoAutenticado`, `baixarAnexoAutenticado`). **Regra:** anexo nunca vira link direto; vai para a galeria ou passa pelo helper. O Lovable tinha corrigido só o `ChargeAttachmentLightbox` (commit `573999c`).

**Fotos em mosaico (desde 2026-10-13, pedido do gestor).** No `MaintenanceChatDialog` e no chat de `TicketDetalhes`, fotos e vídeos saem grandes, em grade, como nos aplicativos de mensagem. Peças em `src/components/chat/`:
- `anexos.ts` — `ehMidiaVisual` (foto/vídeo; TIFF vira arquivo), `separarAnexos`, `ehCorpoDeAnexo` ("Anexo enviado" e "(anexos)" são texto de preenchimento e somem quando há mosaico) e `juntarMensagensDeMidia`: mensagens **só de mídia** do mesmo autor, com a mesma visibilidade (interna/pública) e a menos de 3 min uma da outra viram um grupo único (os envios rápidos gravam uma mensagem por arquivo). O grupo usa a primeira para autor e a última para hora e recibo. Mensagem com texto nunca se junta.
- `ChatMosaico` — 1 foto inteira (largura até 420 px, altura até 420 px), 2 lado a lado, 3 com a primeira alta, 4 em 2×2; da quinta em diante a última célula mostra "+N". `<img loading="lazy">` direto da URL pública (sem passar pelo cache de blob, que baixava tudo de uma vez), vídeo com `preload="metadata"` e selo de play. Sobreposições em preto/branco de propósito (ficam sobre a foto, não sobre o tema).
- `ChatAnexos` — mosaico + cartões `AttachmentBubble` para PDF e outros arquivos; é o que vai no slot `attachments` da bolha. `ChatMessageBubble` ganhou `largura="larga"` (coluna de 92%/84%) e o selo "Nota interna" quando a mídia interna vem sem texto.
- No diálogo: janela `sm:max-w-2xl` (era `max-w-lg`), botão "Galeria · N" no cabeçalho abre a `MediaGallery` no primeiro item. `ChargeChatDialog`, `CobrancaDetalhes` e `BookingCommissionChatDialog` ainda usam a grade antiga (URLs assinadas e `serve-attachment`; adaptar quando pedirem).

### 3.11 Painel da equipe (`/painel`)
Reorganizado em 2026-09-25 (`ROADMAP.md` item 4.6). A página tem esta ordem:

1. lembrete de cobrança de hóspede (`GuestChargeReminders`), no topo desde 2026-10-01;
2. avisos e votações;
3. **Operações**: Manutenções, Cobranças, Chamados e Vistorias em grade 2×2;
4. **Atalhos**: um bloco só, em 5 grupos (`src/components/painel/PainelAtalhos.tsx`);
5. resumo com 4 números (`src/components/painel/PainelResumo.tsx`), no fim da página desde 2026-10-01;
6. chat da equipe (`TeamChatWidget`), depois do conteúdo, fora do topo.

- **Cada número do topo usa a mesma definição da caixa correspondente.** Ao mudar uma, mude a outra.
- **"Vencida" vem de `src/lib/vencimento.ts`** (`estaVencida` e `diasParaVencer`): a cobrança só vence depois do dia do vencimento, e a data é lida como dia local. Não use `new Date(due_date)`: isso lê a data como meia-noite UTC, e a cobrança aparece vencida desde as 21h da véspera.
- **As caixas não têm teto de consulta.** Antes, o `.limit(15)` e o `.limit(50)` apareciam como se fossem o total. Expandir mostra tudo, com rolagem dentro da caixa. A exceção é Vistorias, que é um feed das 15 mais recentes, e o selo diz "recentes".
- **Lembrete de hóspede:** vem de `useGuestCharges`, com a chave `["painel","guest-charges"]`, compartilhada com o resumo. Os grupos são:
  - pronta: 14 dias ou mais desde o check-out;
  - em breve;
  - sem data de check-out.

  Os itens abrem no `DetailSheet`, sem sair do painel.

  Cada linha (`LinhaHospede`, em `GuestChargeReminders.tsx`, desde 2026-10-01) mostra check-out, valor, prazo e situação, com os botões de galeria, adicionar anexo (`QuickAttachUploader`), baixar em .zip e "Cobrada". O valor é editável no clique (`ValorEditavel`): grava em `tickets.charge_draft_amount_cents` e na cobrança só se ela for rascunho; cobrança já lançada fica só leitura. No celular a linha vira cartão em três faixas, com botões de 36 px.
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

A página do proprietário tem a ordem: saudação → resultados em versão mini (`ResultadosMini`, §3.12) → avisos → curadoria/contrato/propostas → imóveis (`OwnerPropertiesSection`, que carrega o próprio título e o botão "Ver resultados") → grade 2/3 + 1/3 (cobranças, comissões, manutenções, chamados | score, `OwnerAjuda`) → números de resumo (`OwnerResumo`, no fim desde 2026-10-03, pedido do gestor). Os dois banners de guia e os botões de relatório só de desktop viraram a caixa `OwnerAjuda`.

### 3.12 Resultados do imóvel (`/resultados/:propertyId`, desde 2026-10-03)
Dashboard por imóvel para o proprietário, com os dados da Hostex: ocupação, diárias, calendário e reservas. Admin e agent abrem a mesma página para qualquer imóvel (atalho "Resultados por imóvel" no painel), para conferir o que o proprietário vê.

- **Uma chamada, zero Hostex.** `resultados_imovel(p_property_id)` (SECURITY DEFINER, migrations `20261003120000_resultados_imovel.sql` e `20261005120100_resultados_imovel_v2.sql`) devolve reservas, preços anunciados e a média da carteira, lendo só o banco. Confere o acesso por `auth.uid()`: admin/agent, ou `has_property_access`. **Não devolve dado pessoal do hóspede** — nome só para a equipe; do telefone sai só a região (`BR-31`, `+54`).
- **Duas fontes de reserva (desde 2026-10-05)**: `reservas_unificadas()` (migration `20261005120000_reservas_unificadas.sql`, uso interno, não liberada ao cliente) junta a Hostex com os relatórios financeiros publicados (`financial_reports.report_data.reservations`). A Hostex só tem reservas de fevereiro/março de 2026 em diante; os relatórios cobrem janeiro. Regra: Hostex manda; do relatório entra só a reserva cujas noites não cruzam nenhuma da Hostex no mesmo imóvel; a mesma reserva em dois relatórios conta uma vez. Cada reserva sai com `fonte` (`hostex` | `relatorio`); as do relatório não têm hóspedes, data da reserva nem origem, e o canal só quando o relatório traz o código (Airbnb `HM…`, Booking 10 dígitos) — sem canal, ficam fora da divisão por canal e são contadas à parte (`mixCanais().semCanal`). Conferido em 2026-10-05: a base (diárias − canal) do MARCELO bate com `totals.totalBase` dos relatórios de jan, mar e abr.
- **Média RIOS (desde 2026-10-06, pedido do gestor)**: por mês, só os imóveis que tiveram ao menos uma noite reservada naquele mês ("funcionais": imóvel novo ou parado não derruba a média), e fora os marcados em `properties.fora_da_media_rios` (hoje JOÃO e REGINA; GIOVANI 1/2/3 nem existem no portal). O cliente ainda ignora meses com menos de 8 imóveis (`MIN_IMOVEIS_REFERENCIA`).
- **Mercado (PriceLabs, desde 2026-10-06)**: tabela `mercado_mensal` (listagem × categoria × mês) com ocupação e diária do mercado em volta de cada listagem, alimentada pela function `pricelabs-sync` (`supabase/functions/pricelabs-sync/`, parser em `parse.ts`, testável sem Deno). Uma chamada de `GET api.pricelabs.co/v1/neighborhood_data?pms=hostex&listing_id=…` por listagem traz: "Market KPI" (meses fechados: dias reservados ÷ disponíveis e receita ÷ noites), "Future Occ/New/Canc" (ocupação diária à frente, média por mês) e "Future Percentile Prices Monthly" (preço anunciado mediano). Categorias: `-1` = listagens vizinhas (padrão), `0`/`1`/`2`… = quartos; `properties.mercado_categoria` escolhe por imóvel. A listagem do PriceLabs se liga ao imóvel pelo id da Hostex embutido no `listing_id` (`20832_12673118_house` → `hostex_properties.id_hostex = 12673118`). Cron `pricelabs-sync-hourly` (xx:25): cada rodada atualiza até 15 listagens com mais de 20 h — ~55 chamadas por dia no total. **O gestor não tem API key do PriceLabs, só o MCP**, então a function e o cron ficam parados até existir o secret `PRICELABS_API_KEY` (Settings → API details, sem custo) e o deploy pelo Lovable. Enquanto isso a carga é manual, documentada em `scripts/mercado-pricelabs/README.md` (`carregar-do-mcp.mjs`): as respostas do MCP não trazem o `listing_id`, o vínculo é por lat/lng, e imóveis no mesmo endereço compartilham o mesmo mercado. Carga completa em **2026-10-07**: 54 imóveis, categoria `-1`, out/2024 a out/2027 (2.109 linhas). Casos: **SUELI** tem 1 listagem só na vizinhança `-1`, por isso `mercado_categoria = '2'` (2 quartos, 251 listagens; as categorias 1/2/3 dela também estão gravadas); **MONICA** não existe no PriceLabs (sem mercado); **ROGERIO3** fica ~1 km fora do ponto da Hostex no PriceLabs (vínculo forçado no script). Os meses "futuro" envelhecem: refazer a carga quando o gestor pedir. Na página: terceira linha azul em "Ocupação mês a mês", coluna na tabela e o destaque "acima/abaixo do mercado".
- **Tudo calculado no navegador**, em `src/lib/resultadosImovel.ts` (datas em "número do dia", para o fuso não deslocar noite). O filtro de período responde sem voltar ao banco.
- **Dinheiro = mesma conta do relatório financeiro** (`report-calculations.ts`): diárias = valor da reserva sem limpeza; base = diárias − taxa do canal; líquido = base × (1 − comissão). Comissão: `properties.default_commission_percentage`, senão o contrato mais recente. O líquido aparece como **estimativa** (some quando não há % ou ele é ≥ 100); o oficial é o relatório.
- **Versão mini no painel do proprietário** (`ResultadosMini.tsx`, logo abaixo da saudação em `/minha-caixa`, desde 2026-10-04): um cartão por imóvel com diárias e ocupação do mês, o que já está reservado, os próximos 14 dias e os últimos 6 meses; o botão abre a página completa. Usa `consultaResultadosImovel` — a mesma chave de cache da página.
- **Só com coleta em dia.** Se a última coleta com reservas tem mais de 72 h (`src/lib/coletaHostex.ts`), o proprietário não vê a versão mini, o botão no cartão do imóvel nem o item "Resultados" da barra do celular, e a página mostra "Resultados em atualização". A equipe vê os dados com um aviso. `coletaHostex.ts` é separado de propósito, para o cálculo da página não entrar no chunk inicial.
- **Peças** em `src/components/resultados/`: `VisaoGeral` (hero, "A seguir", números, destaques, gráficos), `CalendarioReservas`, `ListaReservas`, `blocos.tsx` (`Cartao`, `Cifra`, `DetalheReserva`, `DivisaoDoValor`), `graficos.tsx` (SVG próprio, sem recharts). Página: `src/pages/ResultadosImovel.tsx`, abas por `?aba=`.
- **Gráficos**: cores de série em `--grafico-1..4` + `--grafico-neutro` (`index.css`, claro e escuro), validadas para daltonismo; a cor segue o canal (`CANAIS`), nunca a posição. Texto nunca usa a cor da série. Um eixo por gráfico; toda marca tem dica no hover/foco e o gráfico mensal tem visão em tabela.
- **Animação do topo**: `public/animacoes/rios-fluxo.{webm,mp4}` + `-poster.jpg`, gerados em Remotion a partir de `motion/rios-fluxo/` (fora do build; README lá ensina a regerar). Com "reduzir movimento", fica o quadro parado.
- **"Destaques"** são frases calculadas (`gerarDestaques`), sem IA.

### 3.13 Ajustes (`/ajustes`, desde 2026-10-16)
Pedido do gestor: a equipe via erro em anúncio, ficha, mensagens automáticas, roupa de cama e no próprio sistema e avisava pelo WhatsApp, e o aviso se perdia. Agora cada aviso fica numa lista até alguém marcar como feito.

- **Quem usa:** equipe (admin, agent, maintenance) e faxineiras. Equipe avisa, vê tudo e resolve: aba "A fazer" (urgentes primeiro, depois o mais antigo) e aba "Feitos" (os 60 mais recentes). A faxineira avisa e vê só os próprios avisos, com a situação e a observação de quem resolveu. Ela entra pelo cartão "Viu algo errado?" no topo de `/faxineira`.
- **Tabela `ajustes`** (migration `20261016120000_ajustes.sql`, **aplicada em 2026-10-16** pelo `query_database`): imóvel (nulo = geral ou fora da lista), `categoria` (`anuncio` · `ficha` · `mensagens` · `roupa_de_cama` · `sistema` · `outro`; `sistema` = erro ou melhoria no próprio portal, migration `20261016130000_ajustes_sistema.sql`, aplicada), descrição, `urgente`, `fotos` (caminhos), `status` (`aberto` · `feito` · `descartado`, este mostrado como "Sem mudança"), `resposta`. Vocabulário em `src/lib/ajusteMeta.ts`.
- **O trigger `ajustes_preencher` grava autoria e resolução**, nunca o cliente: `autor_nome` e `resolvido_por_nome` ficam na linha porque a faxineira não lê perfis alheios. Reabrir limpa resolução e observação.
- **RLS** (17 casos testados em transação desfeita antes de aplicar):
  - SELECT: equipe vê tudo; o autor vê os seus.
  - INSERT: equipe e `cleaner`.
  - UPDATE: só equipe.
  - DELETE: admin, ou o autor enquanto está aberto.
  - `anon` sem acesso.
- **Fotos:** bucket **privado** `ajustes` (não o `attachments`, ver §8.15), pasta `<autor>/<aviso>/1.jpg`, só imagem, até 15 MB. A foto é reduzida no aparelho (`comprimirImagem`) e lida por URL assinada de 1 h. Equipe vê todas; o autor vê as suas. O envio fica em `src/lib/enviarAjuste.ts`: se a gravação falhar, apaga as fotos já enviadas.
- **O `types.ts` ainda não tem a tabela**: `tabelaAjustes()` (`src/hooks/useAjustes.ts`) usa o cliente sem tipos até o Lovable regenerar.
- **Entradas:**
  - lembrete `LembreteAjustes` no topo de `/painel`, abaixo do de cobrança de hóspede, com "N a fazer · M urgentes" e o botão "Avisar";
  - atalho "Avisar ajuste" no grupo Criar;
  - ação rápida no "+" do celular.
- **Link direto:** `/ajustes?novo=1&imovel=<id|geral>&tipo=<categoria>` abre o formulário preenchido. Os parâmetros saem da URL depois de lidos.
- **Peças** em `src/components/ajustes/`: `FormularioAjuste`, `CartaoAjuste`, `DialogoResposta`, `LembreteAjustes`. No celular a equipe vê a lista primeiro (formulário atrás de "Avisar um ajuste") e a faxineira vê o formulário; no desktop são duas colunas.
- **Sem notificação por enquanto:** o lembrete do painel é o aviso.
- **Peças compartilhadas com Compras (§3.14)** em `src/components/listas/`: `SeletorImovel` (+ `imovel.ts` com `IMOVEL_GERAL` e `imovelEhValido`), `DialogoObservacao`, `LinhaLembrete` e `formato.ts` (`nomeCurto`, `quando`). Lista nova do mesmo tipo começa por elas.

### 3.14 Compras (`/compras`, desde 2026-10-17)
Pedido do gestor: lista de compras no mesmo molde dos ajustes. Cada pedido tem item, imóvel, quantidade e o link do produto. Não tem cômodo: o gestor desistiu dele no pedido.

- **Quem usa:** os mesmos papéis e regras de §3.13. Equipe pede, vê tudo e marca "Comprado" (com desfazer) ou "Não vai comprar", com observação opcional. A faxineira pede e vê os seus. Aba "A comprar" **agrupada por imóvel** (ordem alfabética, "Geral" no fim; dentro do grupo, o pedido mais antigo primeiro); aba "Comprados" com os 80 mais recentes.
- **Tabela `compras`** (migration `20261017120000_compras.sql`, **aplicada em 2026-10-17**, 12 casos de RLS testados antes em transação desfeita): `property_id` (nulo = geral/estoque), `item` (2–200), `quantidade` (1–999), `link` (só `http(s)`, checado no banco), `status` (`pendente` · `comprado` · `descartado`), `resposta`. Trigger `compras_preencher` grava autor e resolução. RLS igual à de `ajustes`. Sem fotos.
- **Link:** `normalizarLink` (`src/lib/compraMeta.ts`) pega a primeira URL do que foi colado (o "compartilhar" das lojas cola texto junto), aceita `www.` sem `https://` e recusa o resto. O cartão mostra "Ver na loja · amazon.com.br" e abre em nova aba (`noopener`). É link externo de loja, não anexo, então a regra de §3.10 não vale aqui.
- **Entradas:** linha `LembreteCompras` no topo do painel, abaixo da de ajustes ("N a comprar"); atalho "Adicionar compra" no grupo Criar; ação no "+" do celular; cartão "Precisa comprar algo?" ao lado do de ajustes em `/faxineira`. Link direto: `/compras?novo=1&imovel=<id|geral>`.
- **Quem paga** (desde 2026-10-17): `compras.custo` (`owner` · `pm` · `guest`, os valores de `tickets.cost_responsible`; imóvel sugere proprietário, geral sugere gestão). Compra do proprietário, ao marcar "Comprado", **abre a Nova cobrança em janela já preenchida** (dono, imóvel, título "Compra: item", link, categoria `itens`); ao salvar (rascunho ou envio) a compra fica comprada e ligada em `compras.charge_id`, e o cartão mostra "Ver a cobrança". Cancelar a janela deixa a compra pendente; "Comprado, com observação…" conclui sem cobrar. `NovaCobranca` ganhou `inicial` e `onCriada`. Migration `20261017200000_compras_custo.sql`, aplicada.
- **Espelhada em `/admin/manutencoes-lista`** (desde 2026-10-17, pedido do gestor): aba **Compras**, só no desktop, com o número de pendentes. As duas telas usam o mesmo `AreaCompras` (formulário + lista + diálogos); a página só põe o cabeçalho com as pílulas. Cada grupo de imóvel mostra `EstadoImovel` (§3.15).
- **Peças:** `src/pages/Compras.tsx`, `src/components/compras/` (`AreaCompras`, `FormularioCompra`, `CartaoCompra`, `LembreteCompras`), `src/hooks/useCompras.ts` (cliente sem tipos até o `types.ts` ter a tabela). A lista de imóveis do formulário reaproveita `useImoveisAjuste`.

### 3.15 Tarefas de rua (`/tarefas-rua`) e estado do imóvel (desde 2026-10-17)
Pedido do gestor: lugar para o que a equipe de rua precisa ir fazer, com o imóvel e o que é.

- **Tabela `tarefas_rua`** (migration `20261017150000_tarefas_rua_janela.sql`, **aplicada**): imóvel (nulo = geral), `descricao`, `status` (`pendente` · `feita` · `descartada` = "Não precisa"), `resposta`, autoria e resolução pelo trigger `tarefas_rua_preencher`. **Só equipe** (admin, agent, maintenance) vê, cria e resolve; apaga o admin ou quem criou enquanto pendente. Faxineira e anônimo barrados (testado).
- **Página:** mesmo molde de Compras: formulário (imóvel + o que fazer) e "A fazer" agrupado por imóvel, com o estado do imóvel no cabeçalho do grupo; "Feitas" com as 80 mais recentes. Peças em `src/components/tarefas/` e `src/hooks/useTarefasRua.ts`. Entradas: linha `LembreteTarefas` no topo do painel, atalho "Tarefa de rua", "+" do celular. Link `/tarefas-rua?novo=1&imovel=<id|geral>`.
- **Estado do imóvel: `janela_imoveis()`** (mesma migration). SECURITY DEFINER, só devolve linhas para a equipe; **só datas, nada de hóspede**. Por imóvel ativo: `saida` (fim da estadia que inclui hoje; igual a hoje = sai hoje; nula = livre), `proxima_entrada` e `proximo_checkout` (o do hóspede atual, ou o da próxima reserva se está livre). Só reservas `accepted` da Hostex; "hoje" é o dia em Brasília. Conferido em 2026-10-17: 61 imóveis, 35 ocupados, 6 saindo, 11 sem reserva à frente.
- **No front:** `useJanelaImoveis()` (`src/hooks/useJanelaImoveis.ts`, chave `["janela-imoveis"]`, cache de 10 min) devolve um `Map` por imóvel. `EstadoImovel` (`src/components/listas/EstadoImovel.tsx`) mostra "Ocupado · Check-out seg 19/10", "Sai hoje · entra amanhã" ou "Livre até qua 21/10 · Check-out seg 26/10"; `variante="celula"` (duas linhas, tabela) ou `"linha"`. Datas lidas como dia local. Usado na lista de manutenções, nas compras e nas tarefas.
- **Depende da coleta da Hostex** (§3.6): coleta parada = estado errado. Não há aviso de coleta velha nessas telas.

### 3.16 WhatsApp das listas (desde 2026-10-17)
Item novo em Ajustes, Compras ou Tarefas de rua avisa o responsável por WhatsApp (pedido do gestor):

| Lista | Quem recebe |
|---|---|
| Ajustes | gestor (Paulo) |
| Compras **na rua** | Kaique |
| Compras **online** | gestor |
| Tarefas de rua | quem vai cuidar (`tarefas_rua.responsavel_id`; padrão Kaique), com o estado do imóvel hoje e o próximo check-out |

- **Configuração** em `system_config` chave `listas_whatsapp` (a equipe lê e altera; ainda sem tela): `ativo`, listas `ajustes` / `compras_rua` / `compras_online` de `{ perfil, telefone? }` e `tarefas_rua_padrao` (id do perfil). O telefone do item vale mais que o do perfil: **o gestor não tem telefone no perfil**, e o número usado (5522988014013) é o mesmo que já recebia os avisos de lead (`leads_whatsapp.avisar_equipe`). Quem criou o item nunca recebe o aviso dele.
- **Disparo:** trigger `trg_notificar_lista_whatsapp` (AFTER INSERT nas três tabelas) → `pg_net` → edge function **`notificar-listas`** com `x-internal-token` (o token `notificar_cobranca_token` do Vault, conferido por `verificar_token_interno`). Falha nunca bloqueia a gravação. Migration `20261017180000_notificar_listas.sql`, **aplicada**.
- **Mensagem:** modelo genérico `notificacao_rios` da central de WhatsApp (projeto Lovable "Sistema de Roupas de Cama", function `notificar`, parâmetros nome · referência · texto). **Nada novo no Meta.** A Meta recusa parâmetro com quebra de linha: a function junta os espaços.
- **Resultado** em `<tabela>.notificacao_status` (`enviado`, `parcial`, `falhou`, `sem_destino`, `proprio_autor`, `desativado`) + `_em` + `_erro`; os cartões mostram o `SeloWhatsapp` para a equipe.
- **Compras** ganharam `canal` (`rua` | `online`, padrão rua; colar link sugere online) e filtro por canal na lista. **Tarefas** ganharam "Quem vai cuidar" (`responsavel_id` + `responsavel_nome`, gravado pelo trigger). `janela_imoveis()` agora também responde à service role (a function usa).
- `notificar-listas` roda com `verify_jwt = false` (o trigger não manda JWT). Publicada em 2026-10-19 e redeployada em 2026-10-28. Ela também atende o modo `{lote_email}` de §3.19 (e-mail de conclusão ao proprietário, não WhatsApp); esse modo **está publicado desde 2026-10-31** (sonda via `pg_net`: 200 `{"status":"vazio"}` para lote inexistente).

### 3.17 Avisos a proprietários (`/avisos-proprietarios`, desde 2026-10-17)
O que a equipe precisa passar ao proprietário e o que ele mandou, com conversa (pedido do gestor). **Sem tabela nova: cada aviso é um chamado** e a conversa é o chat de `/ticket-detalhes/:id`.
- **Passar ao proprietário:** imóvel (o dono vem de `properties.owner_id`) + assunto + mensagem → chamado `ticket_type = "informacao"` com a primeira mensagem por `create-ticket-message` e e-mail por `notify-ticket` (mesmo caminho do "Novo ticket").
- **Lista** (`useAvisosProprietario`): chamados abertos de informação criados pela equipe + chamados de conversa abertos pelo próprio proprietário (informação, dúvida, hóspedes, bloqueio, outros), fora manutenção em debate. A vez é de quem não escreveu a última mensagem pública: abas **Para responder** / **Aguardando proprietário** / **Encerrados** (60). "Encerrar" conclui o chamado; "Reabrir" volta para `em_analise`.
- **Entradas:** linha `LembreteAvisos` no topo do painel ("N para responder"), atalho "Avisar proprietário", "+" do celular. Só equipe.

### 3.18 Fotos e vídeos nas listas (desde 2026-10-17)
Ajustes, Compras e Tarefas de rua aceitam **foto e vídeo**, na criação e depois (menu "⋯" → "Adicionar foto ou vídeo", só equipe), e abrem na `MediaGallery` (toca vídeo).
- **Um bucket só:** o privado `ajustes` serve às três listas, pasta `<quem subiu>/<id do item>/<n>-<sufixo>.<ext>`; aceita imagem e vídeo (mp4, mov, webm, 3gp, mkv) até **100 MB** (no navegador o vídeo sobe sem compressão). Colunas: `ajustes.fotos`, `compras.anexos`, `tarefas_rua.anexos` (até 10 por item). Migration `20261017220000_anexos_listas.sql`, aplicada.
- **Peças:** `src/lib/anexosListas.ts` (`enviarAnexos`, `assinarAnexos`, `itensGaleria`, `erroDeAnexo`, `novoId`), `EscolherAnexos` (formulário, com prévia), `MiniaturasAnexos` (cartão) e `useAnexosLista.tsx` (`useGaleriaAnexos`, `useAnexarDepois`). Lista nova com anexo usa essas peças.
- O item nasce com id gerado no navegador para os arquivos irem direto para a pasta dele; se a gravação falha, os arquivos que subiram são apagados.
- Leitura por URL assinada (1 h). A faxineira só lê o que ela mesma subiu (policy do bucket por pasta).

### 3.19 Novos imóveis / viabilização (`/novos-imoveis`, desde 2026-10-27)
Pedido do gestor: imóvel novo chega cheio de coisas a fazer (instalação, elétrica, decoração, limpeza pesada) e cada uma vira cobrança ao proprietário. Até aqui isso era feito só pela lista de manutenções (JULIANATAMARO, SANTOS e SORAIA foram assim), sem um lugar que juntasse o imóvel, o proprietário, a visita e o que falta.

- **Sem tabela de itens: item = ticket de manutenção do imóvel.** O registro novo é só o imóvel: tabela `viabilizacoes` (migration `20261027120000_viabilizacoes.sql`, **aplicada em 2026-10-27**, 9 casos de RLS testados em cima da tabela viva): `property_id` (único; nulo enquanto o proprietário não tem conta, porque `properties.owner_id` é obrigatório e `profiles.id` é o usuário do Auth), `nome`, `endereco`, `proprietario_nome/telefone/email`, `etapa`, `visita_em`, `estreia_prevista`, `observacoes`, `anexos` (fotos da visita no bucket `ajustes`, §3.18), autoria e conclusão pelo trigger `viabilizacoes_preencher`. Só equipe (admin, agent, maintenance) vê, cria e muda; apaga admin ou autor; anônimo e proprietário barrados. O Lovable regenerou o `types.ts` em 2026-10-28 (commit `a49556c`, ao puxar o push) com `viabilizacoes`, `viabilizacao_avisos`, `viabilizacao_destino` e `disparar_avisos_viabilizacao`; `src/hooks/useViabilizacoes.ts` ainda usa o cliente sem tipos (trocar quando mexer no hook).
- **Etapas** (`src/lib/viabilizacaoMeta.ts`): `captado` → `visita` → `preparacao` → `pronto` → `no_ar` | `desistiu` (as duas últimas concluem). Mudar para etapa final pede confirmação; voltar reabre (o trigger limpa `concluida_em`).
- **Quadro "Novos imóveis" na lista de manutenções** (segundo quadro, tom `secondary`, ver §3.1): toda manutenção (aberta ou feita e não enviada) de imóvel com viabilização aberta vai para lá, ordenada por imóvel, em vez de Em progresso / Infiltração / Stand-by / Aguardando envio; em debate continua em debate. A célula Quadro mostra a etiqueta "Novo imóvel" no lugar do seletor; a inclusão rápida nesse quadro só aceita imóveis em viabilização. Quando o imóvel vai para "No ar", as manutenções dele voltam aos quadros normais sozinhas. `useImoveisEmViabilizacao` tem cache de 60 s.
- **A página** (`src/pages/NovosImoveis.tsx`, peças em `src/components/viabilizacao/`): pílulas por etapa + Concluídos; um cartão por imóvel (`CartaoViabilizacao`) com endereço (link do mapa), proprietário (WhatsApp e se tem conta), visita, estreia prevista, contagens a fazer / feitos / enviados, Previsto · Cobrado · Em aberto (`src/lib/viabilizacaoResumo.ts`: dinheiro = valor − aporte), barra de progresso, observações (salvam ao sair do campo), fotos da visita e menu com atalhos (compra e tarefa de rua já com o imóvel, lista de manutenções, resultados). Dentro, `ItensViabilizacao`: A fazer · Feitos aguardando envio · Enviados ao proprietário (com o status da cobrança e link). Inclusão rápida em linha (Enter; **colar uma lista cria um item por linha**), quem paga, valor e aporte editáveis (`EditableCell`), anexos (`QuickAttachUploader`), conversa (`MaintenanceChatDialog`), "Enviar ao proprietário" por item e "Enviar os N ao proprietário" em lote (um por vez, mesma pausa de 5 s da lista).
- **Mesmas funções da lista.** O envio ao proprietário e a edição em linha saíram de `AdminManutencoesLista.tsx` para `src/lib/manutencaoLista.ts` (`enviarAoProprietario`, `salvarCampoManutencao`, `avisarResultadoEnvio`); lista e página chamam as mesmas. **Ao mudar o envio, mude ali.** Item novo nasce como a inclusão rápida da lista (`ticket_type = manutencao`, `kind = maintenance`, `status = novo`, `charge_draft_amount_cents`), com `essential = true` (sem a decisão "quem conserta" do proprietário) e `cost_responsible` escolhido na hora (padrão proprietário). Nada notifica o proprietário na criação; ele vê o item em Manutenções como qualquer outro.
- **Compra ou manutenção (desde 2026-10-28, pedido do gestor).** Cada item tem `tickets.natureza` (`manutencao` · `compra`, padrão manutenção; migration `20261028190000_tickets_natureza.sql`, **aplicada em 2026-10-28**, trigger testado em transação desfeita). A compra é o mesmo ticket, com o mesmo envio ao proprietário e a mesma cobrança, mas **não entra na lista de manutenções nem nas outras telas de manutenção da equipe** (§3.1): o gestor a vê e resolve em `/novos-imoveis`, e o funcionário de manutenção vê só manutenção. Vocabulário em `src/lib/ticketMeta.ts` (`NATUREZA_ITEM`, `naturezaDe`). Na página: seletor na inclusão rápida (vale para a lista colada) e na linha do item (etiqueta Manutenção/Compra, antes de "quem paga"), pílulas Todos · Manutenções · Compras quando o imóvel tem os dois, "N compras" no cabeçalho do cartão (`resumirItens().compras`). Compra nasce com `charge_draft_category = itens` e, ao trocar a natureza (`salvarCampoManutencao`, campo `natureza`), ganha ou perde esse "Itens" se ninguém escolheu outra categoria. O proprietário vê a etiqueta "Compra" em `OwnerPreparacao`, na caixa Manutenções de `/minha-caixa` e em `/ticket-detalhes` (`TicketBadges`). **`natureza` ainda não está no `types.ts`**: a inserção do item passa pelo cliente sem tipos e as cinco consultas da equipe filtram por `.filter("natureza", "eq", …)` (`.eq` numa coluna fora do `types.ts` estoura a inferência de tipos); trocar por `.eq` quando o Lovable regenerar.
- **Registrar** (`FormularioViabilizacao`): "Imóvel novo" (nome, endereço, conta do proprietário pelo `SeletorProprietario`, que lista `owner` e `pending_owner` com busca por nome, e-mail ou telefone; com conta, o imóvel é criado em `properties` na hora, nome em maiúsculas), "Já está no portal" (imóvel existente) ou "Puxar de uma ficha de captação" (`property_intake_submissions`, que já traz nome, endereço e a conta quando a pessoa se cadastrou). Sem conta: só anota, e o cartão oferece "Vincular conta ou imóvel" (`DialogoVincular`). Sugestões no topo da página: imóveis dos últimos 240 dias sem anúncio na Hostex e sem registro (em 2026-10-27: SORAIA, JULIANATAMARO, MARCIO).
- **Entradas:** linha `LembreteNovosImoveis` no painel, atalhos "Registrar imóvel novo" (Criar) e "Novos imóveis (viabilização)" (Operação), "+" do celular, item no menu "Mais" da lista. Links `/novos-imoveis?novo=1` e `?imovel=<id>`.
- **E-mail de conclusão ao proprietário (desde 2026-10-28).** O gestor pediu primeiro WhatsApp a cada movimentação e **reverteu no mesmo dia** ("não quero que seja um spam"): o proprietário recebe só a cobrança, como sempre (§3.2), e **um e-mail quando itens da lista passam de em progresso para feito**. Nada avisa etapa, visita, estreia, item novo nem compra concluída (`natureza = compra`: a cobrança avisa). Trigger `trg_ticket_avisar_viabilizacao` (AFTER UPDATE OF status em `tickets`): manutenção de imóvel com viabilização aberta, visível ao proprietário (custo não `pending`/`guest`), ao virar `concluido` entra em `viabilizacao_avisos` (`tipo = item_feito`). O cron `viabilizacao-whatsapp` (nome histórico; a cada 5 min, `disparar_avisos_viabilizacao()`) junta o pendente de cada imóvel depois de 10 min (`system_config.viabilizacao_email.agrupar_minutos`) e chama `notificar-listas` com `{lote_email}` (token interno). A function pula item que já tem cobrança lançada (status `cobrado`: o e-mail da cobrança já avisou), monta o e-mail com o modelo `manutencao_concluida` de `email_templates` (editável em `/configuracao-email`; variáveis `titulo`, `itens_html`, `itens_texto`, `owner_first_name`, `property_name`, `portal_url`) e manda pelo Resend ao e-mail da conta do dono, senão `proprietario_email` (`viabilizacao_destino()`). Resultado em `viabilizacao_avisos.status` (`enviado`, `falhou`, `sem_destino`, `desligado`, `cobrado`); o cartão resume por `situacaoAvisos` (`viabilizacaoMeta.ts`). Controles: `viabilizacoes.avisar_proprietario` (switch no formulário e no menu do cartão; nasce ligado) e `system_config.viabilizacao_email.ativo`. Sem e-mail o aviso espera 24 h e expira; lote sem resposta em 30 min volta à fila até 3 vezes. Migrations `20261028120000_viabilizacao_whatsapp.sql` (fila e cron) e `20261028150000_viabilizacao_email_conclusao.sql` (tira o WhatsApp; só conclusão, por e-mail), **aplicadas em 2026-10-28**, triggers testados em transação desfeita. O modo `{lote_email}` da `notificar-listas` **está publicado desde 2026-10-31** (republicada pelo agente do Lovable junto com as functions de IA, commit `f1bf645`); até então a versão no ar respondia 400 e os avisos acabavam em "falhou".
- **O proprietário vê a preparação no painel dele (desde 2026-10-28, pedido do gestor).** Caixa `OwnerPreparacao` (`src/components/painel/OwnerPreparacao.tsx`) em `/minha-caixa`, logo abaixo da saudação, uma por imóvel com viabilização aberta: etapa no vocabulário dele (Registrado · Visita marcada · Em preparação · Pronto para anunciar), visita, estreia prevista, "N de M itens feitos" com barra, e os itens em A fazer · Feitos · Feitos com cobrança enviada (botão para `/cobranca/:id`). **Só ver e conversar**, decisão do gestor: sem botão de decisão, a RIOS executa sem esperar e o que ele quiser decidir vai pela conversa do item (`MaintenanceChatDialog`; a linha abre `MaintenanceDetailsDialog`). Lê por `minhas_viabilizacoes()` (SECURITY DEFINER, `has_property_access`; devolve só id, imóvel, etapa, visita, estreia e data: nada de observações, telefone, fotos ou autor; viabilização concluída some) e pelos tickets de manutenção do imóvel sem custo de hóspede/em espera. Migration `20261028170000_minhas_viabilizacoes.sql`, **aplicada em 2026-10-28**. A tabela `viabilizacoes` continua só da equipe.
- **Não faz (decisão pendente do gestor):** cobrança consolidada (uma só por viabilização) — cada item vira uma cobrança, como na lista.

---

### 3.20 Assistente de IA com ações (`ia-agente`, desde 2026-10-30)
Plano completo em `PLANO_IA_AGENTE.md` (6 fases). Pedido do gestor: sai o Gemini (gateway do Lovable), entra a **API do Claude da conta dele, `claude-sonnet-5-5`, `effort: medium`**, e a IA passa a executar ações no portal e na Hostex, com o proprietário limitado às unidades dele e tudo em log. **Fase 1 entregue em 2026-10-30 e publicada em 2026-10-31** (deploy pelo agente do Lovable, commit `f1bf645`, que também acrescentou `[functions.ia-agente] verify_jwt = true` ao `config.toml` e regenerou o `types.ts`; conferido por sonda: `ai-consulta` 410, `ia-agente` e `ai-generate-response` respondem "Não autenticado." à chave pública). Para funcionar faltam o secret `ANTHROPIC_API_KEY` e ligar em `/configuracao-ia` → aba Agente.

- **O que havia:** o único chat era o botão "I.A" do `/painel` (`AIConsultaWidget`, só equipe), chamando `ai-consulta`: Gemini 2.5 Flash e **leitura do banco inteiro com a service role sem conferir quem chamava** (perfis com telefone, fichas com senhas, todas as cobranças, para qualquer JWT). `ai-consulta` virou um stub que responde 410; `AIConsultaWidget` e `AIAssistantWidget` (morto desde janeiro) foram apagados. `ai-assistant` (OpenAI, sem uso) continua no repositório até o agente do Lovable remover function e entrada do `config.toml`.
- **Módulo comum `supabase/functions/_shared/ia/`:** `claude.ts` (SDK `npm:@anthropic-ai/sdk`, thinking adaptativo, `output_config.effort`, cache do system fixo, `ErroIA` com status e texto em pt-BR, `refusal` tratado, custo estimado em micro-dólares; **nada de `temperature` nem `tool_choice` forçado**: o Sonnet 5.5 recusa os dois), `politica.ts` (papéis, limites, `exigirAcessoImovel` por `has_property_access`, janela de datas ≤ 400 dias, 50 linhas, 8 s por ferramenta, 8 rodadas), `ferramentas.ts` (14 ferramentas de leitura, todas com o JWT do usuário = RLS; proprietário nunca recebe nome de hóspede) e `prompt.ts` (system fixo por papel + bloco variável com usuário, data, página e imóveis acessíveis).
- **`ia-agente`:** `exigirPapel` → `system_config.ia_agente` (`ativo`, `papeis`, `cotas`, `modelo`, `effort`, `ferramentas_desligadas`; nasce **desligado**) → cotas (mensagens/hora e tokens/dia) → laço Claude ↔ ferramentas. Leitura executa na hora; **escrita pára e devolve `acao_pendente`** para a tela confirmar (`{ confirmar: id }` / `{ cancelar: id }` retomam a conversa; expira em 10 min; uma escrita por rodada). Ainda não há ferramenta de escrita no catálogo (Fase 3). Histórico só anexa (blocos de thinking voltam como vieram); conversa com 60 mensagens pede uma nova.
- **Tabelas** (migration `20261030120000_ia_agente.sql`, **aplicada em 2026-10-30**): `ia_conversas`, `ia_mensagens` (blocos do Claude, uso de tokens, custo) e `ia_acoes` (ferramenta, entrada, resultado ≤ 16 KB, status `executada | aguardando_confirmacao | confirmada | cancelada | negada | erro | expirada`). SELECT para o próprio usuário e admin/agent; **só a service role grava**. `ai_settings` ganhou `effort` e o modelo passou a `claude-sonnet-5-5`. O `types.ts` ganhou as tabelas em `f1bf645`; `useAssistenteIA.ts` ainda usa o cliente sem tipos (trocar quando mexer no hook).
- **Front:** `src/components/ia/AssistenteIA.tsx` montado **uma vez em `App.tsx`** (lazy), visível para a equipe quando `ia_agente.ativo` e o papel estão ligados, fora das rotas públicas; estado da conversa sobrevive à navegação; histórico de conversas; `CartaoAcao` para confirmar/cancelar; "Consultou: …" sob a resposta (`ferramentas_usadas`). `ConfigAgenteIA` é a aba **Agente** de `/configuracao-ia` (interruptor, modelo, effort, papéis, cotas, ferramentas desligadas). Vocabulário em `src/lib/iaMeta.ts`.
- **`ai-generate-response`** (sugestões em chamado/cobrança, títulos, "Testar prompt") migrou para o módulo comum: `ai_settings`/`ai_templates` lidos com a service role depois do `exigirPapel` (antes agent/maintenance recebiam "AI settings not configured" por RLS), `effort` no lugar de `temperature`, `max_tokens` mínimo 1.500 (o thinking conta), e a ação `test_prompt` (só admin) substitui a chamada ao gateway feita do navegador com `VITE_LOVABLE_API_KEY`, que não existia. As outras functions de IA (`curadoria-ai`, `parse-ficha-anuncio`, `summarize-*`, `daily-summary`, `transcribe-audio`…) **ainda estão no Gemini/OpenAI**: Fase 6 do plano.
- **Checagem local:** `cd supabase/functions && npx -y deno@2 check ia-agente/index.ts` (instala o SDK em `node_modules`, ignorado; apague o `deno.lock` que ele gera).
- **Proprietário ainda não vê o assistente** (Fase 2): `papeis.owner = false` e as ferramentas de proprietário dependem de fechar as policies de `hostex_properties`/`hostex_reservations` (§8.16).

---

## 4. Regras invioláveis — e o status real de cada uma

| # | Regra | Status hoje |
|---|---|---|
| 1 | Só tokens semânticos, nunca cor crua do Tailwind. Exceção: tutorial e escala do score | ⚠️ **708 ocorrências** fora de `ui/` (eram 804). **Zero** nas páginas de chamados, cobranças, manutenções e comunicação desde 2026-09-28; o que sobra está nos tutoriais e no score (exceções), vistorias, relatórios, contratos e curadoria |
| 2 | `EmptyState` e `SectionSkeleton` para vazio/carregamento. Sem emoji, sem "Carregando..." solto | ✅ nas páginas de chamados, cobranças, manutenções e comunicação (redesign de 2026-09-28: skeleton + `EmptyState` com ilustração). Sobram 6 "Carregando..." soltos fora delas (vistorias, relatórios) |
| 3 | Nunca criar prazo/contador de SLA em ticket | ✅ **removido em 2026-09-28**: coluna, contagem regressiva, ordenação por `sla_due_at` e a promessa "resposta em até 24h/6h" do formulário do proprietário. `grep sla_due_at src` fora de `types.ts` = 0 |
| 4 | Nome de anexo anonimizado ("Imagem", "PDF") | ✅ nas conversas e galerias desde 2026-09-28 (`AttachmentBubble`, `MediaGallery`, ZIP com `anexo-01.jpg` via `zipFileName.ts`, mensagem gravada "Anexo enviado" sem nome). O nome real continua em `file_name` no banco; só não aparece |
| 5 | Proprietário não vê o calendário geral de reservas nem dado pessoal de hóspede | ✅ `/calendario-reservas` redireciona para área da equipe. **Mudou em 2026-10-03 (pedido do gestor):** o proprietário vê o calendário e as reservas **do próprio imóvel** em `/resultados` (§3.12), sem nome, telefone ou e-mail do hóspede |
| 6 | Janela de 7 dias; penalidade só depois | ✅ |
| 7 | Papel em tabela separada, checado por `security definer` | ❌ **`role` é coluna de `profiles`**; não existe `user_roles` em 171 migrations |
| 8 | Voltar de lista usa `replace: true` | ✅ nas páginas do redesign, via `CabecalhoPagina voltarPara` (§5). ⚠️ parcial no resto |
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

**Casco das páginas internas (desde 2026-09-28).** Listas, detalhes e formulários de chamados, cobranças, manutenções e comunicação usam `src/components/painel/PaginaInterna.tsx`:
- `PaginaInterna` — `cabecalho` + `largura` (`estreita` formulários · `media` detalhes · `larga` listas) + `comNavInferior` (reserva espaço para a barra do celular).
- `CabecalhoPagina` — barra fixa de 56 px: voltar (`voltarPara` usa `replace: true`, regra nº 8), ícone tingido, título único da página, `acoes` e a linha `abaixo` para pílulas de escopo e filtros (`BarraFiltros`, `AbaPilula`).
- `Etiqueta` (`Etiqueta.tsx`) — pílula de status no tom semântico; `ListaDefinicoes`/`Definicao` (`Definicoes.tsx`) — rótulo/valor nas páginas de detalhe.
- Padrão de lista: `Card` com `ListFilters`, skeleton no carregamento, `EmptyState` com ilustração, tabela no desktop (`hidden md:block`) e `LinhaCaixa` no celular (`md:hidden`). Referência: `src/pages/TodosTickets.tsx`.

**Vocabulários únicos de status.** Nunca crie mapa local de status:
- Chamados: `src/lib/ticketMeta.ts` (`STATUS_TICKET`, `PRIORIDADE_TICKET` — só `normal`/`urgente` —, `TIPO_TICKET` com os 9 tipos do enum) e as etiquetas em `src/components/tickets/EtiquetasTicket.tsx`.
- Cobranças: `src/lib/cobrancaMeta.ts` (`STATUS_COBRANCA` com os 15 status, `estaPaga`/`estaEmAberto`/`estaResolvida`, `valorDevido`, `formatarData` para coluna DATE) e `src/components/cobrancas/` (`EtiquetaStatusCobranca`, `ResumoValorCobranca` com Total · Aporte · Crédito · A pagar). Toda condição "está paga" passa por `estaPaga`: o webhook grava `pago_antecipado`/`pago_no_vencimento`/`pago_com_atraso`, e comparar só com `paid` deixava o QR de pagamento visível em cobrança já paga.

**Ilustrações de estado vazio:** `public/ilustracoes/{chamados,cobrancas,manutencoes,conversa,busca}.webp` (480×360, fundo transparente, geradas no Atlas Cloud em 2026-09-28 com a paleta terracota + azul). Uso: `<EmptyState ilustracao="cobrancas" />` nos vazios de página inteira; nos vazios pequenos, `icon`/`CaixaVazia`.

**Galeria de verificação visual:** para conferir componentes sem sessão, crie `preview.html` na raiz + `src/__preview/main.tsx` (entrada Vite separada, marcada `TEMP-PREVIEW`, apagada antes do commit). Rota com perfil falso para montar páginas protegidas não é aceita.

Piores ofensores de cor crua hoje (fora das exceções de tutorial e score): `OwnerScoreCard`, `PlanoPerformanceSection`, `EditInspectionDialog`, `CleanerInspectionForm`, `TeamInspectionDialog`, `PropostaCompleta`, `ProposalBulkPurchasePanel`. `CobrancaDetalhes`, `AdminManutencoesLista` e `MinhasCobrancas` zeraram em 2026-09-28. As variantes `success`/`warning` do `Button` usam os tokens desde a mesma data.

---

## 6. Padrões de dados

Convivem React Query e `useEffect` + `supabase` manual. `new QueryClient()` **sem `defaultOptions`** (`src/App.tsx:102`) → `staleTime: 0`, refetch a cada montagem.

**Envio de anexos (desde 2026-09-28).** Tudo passa por `src/lib/fileUpload.ts`:
- `processFileForUpload` reduz fotos no aparelho: lado maior de até 1920 px, JPEG 0,82. Uma foto de câmera de 6,7 MB fica com 0,3 MB. Imagem de até 500 KB passa direto, e é o caso da foto do WhatsApp. Se a imagem não puder ser lida, vai a original, porque anexo é prova. Vídeo segue no FFmpeg, que só roda com `SharedArrayBuffer`. O site não tem os cabeçalhos COOP/COEP, então na web o vídeo sobe sem compressão.
- `emParalelo` / `emParaleloOuFalha` enviam até 3 arquivos ao mesmo tempo. Tela nova de anexo usa os dois.
- Em envio paralelo, o nome no storage não pode depender só de `Date.now()`. Inclua o índice ou um UUID, senão dois arquivos colidem.
- `upload-sign` só devolve um nome de arquivo e não autoriza nada. Ele segue nas quatro telas "Novo …", por decisão pendente.

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
13. **Higiene** 🟡 — 51 `console.log`; 192 `aria-label` (eram 25); 6 "Carregando..." soltos (eram 34); **40 classes com opacidade dupla** (`bg-info/10/50`), que o Tailwind não gera, fora das páginas do redesign. (`lang="pt-BR"` e `viewport-fit=cover` corrigidos em 2026-09-25.)
14. **Arquivos gigantes** 🟡 — `AdminManutencoesLista.tsx` ~2000 (era 3419; dividida em 2026-09-28, ver §3.1), `AtualizacaoAnuncio.tsx` 1791, `CobrancaDetalhes.tsx` ~1700, `PlanoPerformanceSection.tsx` 1268, `TicketDetalhes.tsx` ~1160.
15. **Anexos listáveis sem login** 🔴 — o bucket `attachments` é público e tem a policy `Anyone can view attachments`, para o papel `public`. Com a chave anônima, qualquer pessoa lista e baixa os **6.002 arquivos**. Confirmado em `pg_policies` em 2026-09-25. Não basta tornar o bucket privado: o app usa `getPublicUrl` e grava URL pública em `ticket_attachments.file_url`. Ver `ROADMAP.md` 1.14.
16. **Proprietário lê `hostex_reservations` cru** 🟠 — a policy `Owners can read own hostex_reservations` libera a linha inteira, com `guest_name` e `raw` (telefone e e-mail do hóspede). Nenhuma tela usa isso: `/resultados` lê pela função `resultados_imovel`, que já filtra. Remover a policy fecha a exposição sem quebrar nada (confirmado por busca no `src/` em 2026-10-03); decisão pendente do gestor.

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
