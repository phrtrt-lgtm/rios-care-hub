# Plano — Assistente de IA com ações (portal + Hostex)

Escrito em **2026-10-30** sobre o commit `dc8d9cd`, por leitura direta do código e conferência no banco.
Pedido do gestor: o assistente de IA passa a **executar ações** no portal e na Hostex, para a equipe e para o proprietário, com o proprietário limitado às unidades dele e a um conjunto fechado de ações, tudo registrado em log; e o motor sai do GPT para a **API do Claude (Sonnet 5.5, effort médio)**.

> Regra deste documento: fato tem `arquivo:linha`; o que não foi confirmado está marcado **[DÚVIDA]**; decisão que é do gestor está marcada **[DECISÃO]**.

---

## 0. Resumo

1. **Hoje não existe assistente em todas as páginas.** O único chat é o botão "I.A" do `/painel`, só para a equipe (`src/pages/Painel.tsx:107`). Ele roda no gateway do Lovable com **Gemini 2.5 Flash**, não no GPT (`supabase/functions/ai-consulta/index.ts:568-575`). O GPT (OpenAI) só aparece em três functions de apoio (§1.2).
2. **Esse chat é um vazamento.** Ele lê o banco inteiro com a service role, sem olhar quem chama: todos os perfis com e-mail e telefone, todas as fichas de imóvel (Wi-Fi, senhas) e todas as cobranças vão para o prompt (`ai-consulta/index.ts:17-19`, `:86-95`). Qualquer JWT válido recebe isso, inclusive o de um proprietário ou a chave pública. A troca de motor é a hora de fechar isso.
3. **A IA não executa nada hoje.** Só responde texto; o prompt diz "SOMENTE LEITURA" (`ai-consulta/index.ts:562-563`). Na Hostex o portal só lê (§1.3).
4. **Bloqueio de data já existe em versão manual**: o proprietário pede, sobe o comprovante da taxa de limpeza à mão e a equipe marca "Processado" sem a Hostex ser tocada (§1.4). 45 pedidos até hoje, 3 pendentes. É isso que vira o fluxo pago com QR Code e reserva direta (§4).
5. **Arquitetura proposta:** uma function nova, `ia-agente`, com o Claude decidindo e **o servidor executando** cada ação com a identidade do usuário (RLS) e uma política por papel por cima. Toda escrita pede confirmação na tela antes de rodar. Tudo vai para três tabelas de log (§2, §5).
6. **Seis fases**, da troca de motor ao bloqueio pago (§7). A primeira já fecha o vazamento e põe o Claude no ar.
7. **Depende de você:** criar a chave `ANTHROPIC_API_KEY`, preparar a Hostex para reserva de uso próprio e pedir os redeploys pendentes (§8).

---

## 1. O que existe hoje

### 1.1 O chat e quem o vê
- `src/components/AIConsultaWidget.tsx`: botão flutuante "I.A" (`:81-87`) e `Dialog` (`:89-90`). Montado **só** em `src/pages/Painel.tsx:21,107`, com `{isTeam && …}` (`:55` = admin, agent, maintenance). Proprietário e faxineira não têm nada.
- Envia o histórico inteiro a cada pergunta (`:46-48`); estado em `useState` (`:25`); **nada é persistido** (sem tabela, sem `localStorage`).
- `src/components/AIAssistantWidget.tsx` é **código morto**: tirado do painel no commit `a10a1c2` (2026-01-03), chama `ai-assistant` (OpenAI `gpt-5-mini`, `supabase/functions/ai-assistant/index.ts:67-74`) e tem `return null` antes de `useEffect` (`:33`).

### 1.2 As functions de IA e o provedor de cada uma
Todas chamam `/v1/chat/completions` por `fetch`, sem streaming, sem rate limit próprio, e **nenhuma usa `exigirPapel`**.

| Function | Provedor / modelo | Confere quem chama? | Observação |
|---|---|---|---|
| `ai-consulta` (o chat) | Lovable → `google/gemini-2.5-flash` (`:568-581`) | **Não.** Service role (`:17-19`) | Vazamento descrito em §0.2. O fallback para `hostex-proxy` manda a service role como Bearer (`:138-149`) e deve receber 401, porque o proxy faz `exigirPapel` (`hostex-proxy/index.ts:165`) |
| `ai-generate-response` (sugestões em chamado/cobrança) | Lovable; templates leem `ai_settings.model` (`:420-427`) | Sim: JWT + `profiles.role` equipe (`:27-61`) | Única que grava `ai_usage_logs` (`:457-467`). Lê `ai_settings` com o JWT do usuário, mas a RLS é só admin (banco, conferido): agent/maintenance devem receber "AI settings not configured" |
| `curadoria-ai` | Lovable → `gemini-2.5-pro` (`:175-197`) | Só login (`:112-121`) | Usa `tool_choice` forçado para saída estruturada (`:149-150`) — **não funciona no Sonnet 5.5** (§2.1) |
| `parse-ficha-anuncio` | Lovable (`:177-190`) | **Não** | Chamada pelo proprietário; `tool_choice` forçado |
| `summarize-conversation`, `summarize-inspection`, `parse-inspection-problem`, `daily-summary`, `bulk-edit-fichas`, `generate-service-summary` | Lovable → `gemini-2.5-flash` | Variado; `daily-summary` confia no `userId` do corpo (`:32-39`); `generate-service-summary` roda com `verify_jwt=false` e **não tem chamador** em `src/` | |
| `ai-assistant`, `generate-inspection-summary`, `transcribe-audio` | **OpenAI direto** (`OPENAI_API_KEY`): `gpt-5-mini`, `gpt-4.1`, `whisper-1` | Não | `transcribe-audio` é fala→texto: o Claude não faz isso; fica no Whisper ou troca por outro STT |

Configuração: `ai_settings` (1 linha: `google/gemini-2.5-flash`, temp 0.2, 800 tokens, prompt de 781 caracteres), `ai_templates` (6: `bloqueio_data`, `cobranca_7dias`, `duvida_manutencao`, `informacao_geral`, `ticket_response`, `charge_response`), `ai_usage_logs` (**25 linhas, a última de 2026-04-14**), `ai_prompt_versions` (0). Conferido no banco em 2026-10-30. A página `/configuracao-ia` (`src/pages/ConfiguracaoIA.tsx`) só alcança o caminho de templates do `ai-generate-response`; o chat ignora tudo (`ai-consulta/index.ts:522-566`, prompt fixo). O botão "Testar Prompt" chama o gateway do navegador com `import.meta.env.VITE_LOVABLE_API_KEY`, que não existe no `.env` (`ConfiguracaoIA.tsx:214-231`).

### 1.3 Hostex: só leitura
- Base `https://api.hostex.io/v3`, header `Hostex-Access-Token`, secret `HOSTEX_API_KEY` — definidos três vezes (`_shared/hostexReserva.ts:4,29`, `hostex-sync/index.ts:13,59-63`, `hostex-proxy/index.ts:11,223-227`).
- Endpoints usados: `GET /properties`, `GET /reservations`, `POST /listings/calendar` (leitura de preço/inventário), `GET/POST/DELETE /webhooks` (`hostex-sync/index.ts:208,295-304,367-375`; `hostex-webhook-registrar/index.ts:47-59`). **Nenhum POST de disponibilidade, reserva ou preço.**
- `hostex-proxy`: 4 actions de leitura (`:16-29`), cache em memória de 5 min compartilhado entre usuários (`:12,:180-186`), só equipe (`:165`).
- Webhook ao vivo: 124 eventos, o último às 00:18 de hoje; sync em dia (último `hostex_sync_log` à 00:00 de hoje, 1.648 reservas, 62 propriedades Hostex, **5 sem imóvel no portal**). Canais no banco: `airbnb`, `booking.com`, `hostex_direct` (16 reservas diretas).
- Vínculo Hostex→portal por nome normalizado (`hostex-sync/index.ts:219-255`); não há tela de vínculo manual.

### 1.4 Bloqueio de datas pelo proprietário (manual)
- `src/components/DateBlockRequestDialog.tsx`: datas → motivo (`maintenance` | `family_visit`, este "requer comprovante da taxa de limpeza", `:243`) → **arquivo de comprovante** no bucket **público** `attachments`, pasta `block-proofs/` (`:98-107`) → INSERT em `date_block_requests` com `status = pending` (`:110-119`). A tela promete "bloqueadas em até 1h30" (`:339,:362`).
- Equipe: `/admin/bloqueios-datas` (`src/pages/AdminBloqueiosDatas.tsx`, "Fila do robô", `:153`). "Processado" só troca o status (`:85-100`); **não chama a Hostex** nem grava `processed_by`. Nada avisa a equipe de pedido novo.
- Banco (conferido): 37 processados, 5 rejeitados, 3 pendentes; 6 de uso pessoal; último pedido em 2026-10-30. **Não existe taxa de limpeza por imóvel** em `properties`; só em relatórios e `booking_commissions.cleaning_fee_cents`.
- PIX: não há tabela genérica de pagamento. O molde mais limpo é `create-group-booking-payment` (valida dono, valor do banco, `metadata` com flag); o `mercadopago-webhook` despacha por prefixo de `external_reference` e `metadata.type` (`:163-312`, `:397-459`, `:462-522`, `:525-651`, `:654-762`) e **nunca compara `transaction_amount`** com o devido (ROADMAP 1.8).

### 1.5 Escopo proprietário ↔ imóvel (já existe, reaproveitar)
- `properties.owner_id NOT NULL` + `property_members (property_id, user_id)` sem papel: membro = coproprietário.
- `has_property_access(_user_id, _property_id)` SECURITY DEFINER = dono **ou** membro (conferido no banco; não inclui equipe). `is_team_member` = admin, agent, maintenance.
- Exemplos de RPC que conferem `auth.uid()` e devolvem só o necessário: `resultados_imovel` (sem dado pessoal de hóspede), `janela_imoveis`, `minhas_viabilizacoes` (CLAUDE.md §3.12, §3.15, §3.19).
- Front: `src/lib/ownerScope.ts` (`propertiesScopeFilter`, `:37-40`).
- Policies que atrapalham o escopo: `hostex_properties` legível por qualquer autenticado, com `raw` (banco); `Owners can read own hostex_reservations` libera `guest_name` e `raw` (CLAUDE.md §8.16). Nenhuma tela depende delas.

### 1.6 Logs existentes para copiar o padrão
`financial_report_audit_log` (`action`, `actor_id/name/role`, `details jsonb`), `contract_events` (`event_type`, `actor_role`, `payload`), `hostex_webhook_events` (caixa de entrada idempotente com `processed_at`/`error`), `viabilizacao_avisos` (fila com tentativas). Autoria gravada por trigger `*_preencher` com `auth.uid()`.

---

## 2. Decisões de arquitetura

### 2.1 Motor: API do Claude, direto, com o SDK oficial
- **Modelo `claude-sonnet-5-5`**, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }` (pedido do gestor; é também o ponto de partida recomendado para uso com várias ferramentas). Tarefas curtas e baratas (título de chamado, classificar problema de vistoria) podem usar `claude-haiku-5-5`.
- SDK `@anthropic-ai/sdk` via `npm:` no Deno; secret **`ANTHROPIC_API_KEY`** no Lovable Cloud. Sem gateway no meio: o gateway do Lovable cobra em crédito do Lovable e não dá tool use com o nosso controle.
- **O que muda em relação ao código de hoje** (quebra se for só trocar a URL):
  - `temperature` com valor não padrão → **400** no Sonnet 5.5. `ai_settings.temperature` morre; entra `effort`.
  - `tool_choice` forçado (`any`/`tool`) → **400**. `curadoria-ai` e `parse-ficha-anuncio` passam a usar **saída estruturada** (`output_config.format` com JSON Schema) ou `tool_choice: auto` + `strict: true`.
  - Resposta pode começar com blocos `thinking`; ler por `type`, nunca `content[0].text`; devolver os blocos `thinking` sem alterar nas próximas chamadas (preserved thinking; histórico **só anexa**, nunca edita).
  - `stop_reason: "refusal"` chega como HTTP 200: tratar antes de ler o conteúdo, com mensagem em pt-BR.
  - `max_tokens` do chat: ~4.000 (inclui o thinking). Sem prefill de assistant.
- **Cache de prompt:** system prompt fixo + lista de ferramentas (ordem determinística por papel) com `cache_control: { type: "ephemeral" }`; o que varia (usuário, data, página, imóveis) vai **depois**, na primeira mensagem de usuário. Mínimo cacheável no Sonnet 5.5: 512 tokens. Conferir `usage.cache_read_input_tokens > 0` no log.
- **Custo estimado** (preços de lista: US$ 2 / 1M entrada, US$ 10 / 1M saída, US$ 0,20 / 1M leitura de cache): uma pergunta com 1–2 ferramentas ≈ 6 k tokens de prefixo em cache + 3 k novos + 2 k de saída com thinking ≈ **US$ 0,03–0,05**. 100 conversas por dia ≈ US$ 100–150/mês. O log por mensagem (§5) dá o número real; só decidir cota depois de medir. **[DÚVIDA]** se o crédito de US$ 200 do plano vale para a API: confira em console.anthropic.com → Billing.
- Um módulo só: `supabase/functions/_shared/ia/claude.ts` (cliente, modelo, effort, tratamento de erro/refusal, gravação de uso). **Toda function de IA passa a chamar esse módulo**; nenhuma faz `fetch` direto.

### 2.2 Hostex: pela API, não pelo conector MCP
- O MCP da Hostex serviu de **especificação**: os esquemas de `update_availabilities` (`property_ids[]`, `start_date`, `end_date`, `available`), `create_reservation` (exige `property_id`, `custom_channel_id`, `check_in/out_date`, `guest_name`, `currency`, `rate_amount`, `commission_amount`, `received_amount`, `income_method_id`; `channel_id` alfanumérico torna a criação idempotente), `search_availabilities`, `search_listing_calendars`, `search_reservations` e `update_listing_prices` são os mesmos da API v3. Nossas ferramentas copiam esses nomes e campos.
- **Por que não ligar o Claude direto no MCP da Hostex** (`mcp_servers` da API): a ferramenta rodaria do lado da Anthropic, com a chave inteira da Hostex, e **nós não interceptaríamos** cada chamada para conferir papel, imóvel e cota, nem para gravar log. Para proprietário isso é inaceitável; para a equipe perde o registro. Além disso não sabemos se a Hostex expõe um servidor MCP remoto com autenticação por chave **[DÚVIDA]**.
- Um cliente só: `_shared/hostex.ts` (base, header, `conferirRespostaHostex`, GET/POST com timeout de 8 s), que substitui as três cópias de hoje (§1.3). O `hostex-proxy` passa a usar o mesmo cliente.
- **Pré-requisito a conferir** em Fase 0: se o token atual tem permissão de escrita. Teste inofensivo: `GET /custom_channels` e `GET /income_methods`; depois um `POST /availabilities` numa data a 3 anos de um imóvel em viabilização, revertido em seguida.

### 2.3 Um cérebro, uma function: `ia-agente`
```
widget (React) ──invoke──▶ ia-agente (Deno)
                            ├─ exigirPapel → quem é, qual papel
                            ├─ userClient (anon + JWT do usuário) → RLS vale para tudo que a IA lê e escreve
                            ├─ adminClient (service role) → só para gravar log e para o que a RLS não permite de propósito
                            ├─ catálogo de ferramentas filtrado pelo papel → `tools` do Claude
                            ├─ laço: Claude → tool_use → política → executa (leitura) ou pausa (escrita) → tool_result → Claude …
                            └─ grava ia_mensagens + ia_acoes
```
- **Duas muralhas.** A primeira é a RLS: a IA lê e escreve com o JWT do usuário, então um proprietário não alcança nada que já não alcance pela tela. A segunda é a **política** (`_shared/ia/politica.ts`): quais ferramentas cada papel vê, quais exigem confirmação, limites de linhas e de janela de datas, e a checagem explícita `has_property_access(uid, property_id)` em **toda** ferramenta com imóvel, mesmo quando a RLS já filtraria. Ferramenta proibida para o papel **não entra na lista** enviada ao modelo; ele nem sabe que existe.
- **Laço manual** (não o Tool Runner): a confirmação de escrita precisa de uma volta à tela, então a function devolve e retoma depois (§2.4). Limite de **8 iterações** por mensagem; resultados de chamadas paralelas voltam juntos numa única mensagem `user`; erro de ferramenta volta como `tool_result` com `is_error: true` e texto em pt-BR, nunca derruba a conversa.
- **Contexto que entra no prompt**: nome, papel, data em Brasília, rota e ids da página de onde o usuário fala (`/resultados/:propertyId`, `/ticket-detalhes/:id`), e a lista curta de imóveis acessíveis. **Nada de despejar tabelas**: o modelo pede pelas ferramentas o que precisar.
- **Histórico persistido** em `ia_conversas` / `ia_mensagens` (§5), guardando os blocos do Claude como vieram (thinking, tool_use, tool_result). Isso resolve dois problemas de hoje (nada é guardado; o histórico inteiro é reenviado pelo cliente) e permite retomar o laço depois da confirmação.
- **Limite de tempo da function**: ~150 s de relógio no Supabase **[DÚVIDA: confirmar no Lovable Cloud]**. Effort médio com 2–4 ferramentas fica em 10–40 s. Streaming (SSE) fica para a Fase 6.

### 2.4 Toda escrita pede confirmação na tela
1. O modelo chama uma ferramenta de escrita.
2. A function **não executa**: grava em `ia_acoes` com `status = aguardando_confirmacao`, o `input` e um resumo humano, e devolve ao widget `{ acao_pendente }` junto com o texto do modelo até ali.
3. O widget mostra um **cartão de ação** ("Abrir chamado 'Infiltração no teto' no imóvel MARCELO — Confirmar / Cancelar").
4. Confirmar → `ia-agente { confirmar: acao_id }`: reconfere usuário, papel, política e validade (10 min), **executa**, grava `executada`, anexa o `tool_result` à conversa e chama o Claude de novo para ele encerrar ("Feito. Chamado #… aberto."). Cancelar → `cancelada`, e o modelo recebe "o usuário cancelou".
5. Leitura não pede confirmação, mas também vai para `ia_acoes` (`nivel = leitura`), para o gestor ver o que cada proprietário consultou.

Vale para equipe e proprietário. Ações da Hostex com efeito em canal (bloquear, reservar, preço) mostram no cartão o imóvel, as datas e o efeito ("vai fechar 3 noites no Airbnb e no Booking").

### 2.5 Escopo do proprietário
- Imóveis = `has_property_access`. Ferramentas de proprietário **não têm parâmetro `owner_id`**; o dono vem do JWT.
- Dado de hóspede: proprietário recebe o que `resultados_imovel` já libera (sem nome, telefone ou e-mail; CLAUDE.md regra nº 5). Equipe recebe nome.
- Hostex ao vivo: proprietário **nunca** chama a API da Hostex; lê o cache do banco (`hostex_reservations`, `hostex_listing_calendar`, `date_block_requests`). A equipe pode consultar ao vivo quando o cache tem mais de 12 h.
- Proibido ao proprietário pela IA (não existe ferramenta): bloquear ou liberar datas direto, criar ou cancelar reserva, mudar preço, mandar mensagem a hóspede, rodar sync, criar/pagar/marcar cobrança, ver outros proprietários, baixar anexos em lote, disparar notificação, mexer em perfil ou papel. O pedido "bloqueia tal data" cai na ferramenta `iniciar_bloqueio_de_datas`, que só **abre o fluxo pago** (§4).

### 2.6 Logs
Três tabelas (§5). O gestor vê em `/admin/ia-acoes`: por usuário, imóvel, ferramenta, status e período; cada linha abre o `input`, o resultado resumido e a conversa. O proprietário vê as próprias conversas no widget. `ai_usage_logs` fica para o `ai-generate-response` até ele migrar; depois é substituído por `ia_mensagens`.

### 2.7 Proteção do desempenho do site
- **Cotas** em `system_config.ia_agente` (admin edita): mensagens por hora por usuário (sugestão: proprietário 20, equipe 60), tokens por dia por usuário, e **interruptor geral** (`ativo`) e por papel. Excedeu → 429 com mensagem em pt-BR; nada chega ao Claude.
- Toda leitura tem **teto de linhas** (50) e **janela máxima** (400 dias); nenhuma ferramenta faz `select *` sem filtro; consultas pesadas (resultados por imóvel) passam pelas RPCs que já existem.
- Sem ferramenta de sync, de lote, de notificação em massa ou de exportação. `hostex_sincronizar` existe só para admin, com confirmação, e respeita o intervalo mínimo da function.
- Timeout de 8 s por ferramenta; 8 iterações por mensagem; `max_tokens` fixo.
- O cache em memória do `hostex-proxy` é compartilhado entre usuários (`:12`); as ferramentas de leitura ao vivo da equipe reaproveitam isso, as de proprietário nem chegam lá.

---

## 3. Catálogo de ferramentas por papel

Nível: **L** leitura (executa direto) · **E** escrita (pede confirmação). Papéis: **A** admin · **G** agent · **M** maintenance · **P** proprietário (dono ou membro). Faxineira entra numa fase posterior **[DECISÃO]**.

| Ferramenta | Nível | A | G | M | P | Fonte / efeito |
|---|---|---|---|---|---|---|
| `listar_imoveis(busca?)` | L | ✓ | ✓ | ✓ | ✓ só os seus | `properties` via RLS |
| `reservas_do_imovel(property_id, de, ate)` | L | ✓ | ✓ | ✓ | ✓ sem hóspede | `hostex_reservations` + `date_block_requests`; P pela RPC |
| `disponibilidade(property_id, de, ate)` | L | ✓ | ✓ | ✓ | ✓ | cache; equipe pode ao vivo (`GET /availabilities`) |
| `resultados_do_imovel(property_id, periodo)` | L | ✓ | ✓ | – | ✓ | `resultados_imovel()` |
| `estado_dos_imoveis_hoje()` | L | ✓ | ✓ | ✓ | – | `janela_imoveis()` |
| `chamados(status?, property_id?)`, `detalhe_chamado(id)` | L | ✓ | ✓ | ✓ | ✓ os seus | `tickets` + `ticket_messages` via RLS |
| `cobrancas(status?)`, `detalhe_cobranca(id)` | L | ✓ | ✓ | ✓ | ✓ as suas | `charges` via RLS; "vencida" por `src/lib/vencimento.ts` portado |
| `cobrancas_em_atraso()` | L | ✓ | ✓ | – | – | `cobrancas_em_atraso()` |
| `manutencoes(quadro?)` | L | ✓ | ✓ | ✓ | ✓ as suas | mesma consulta da lista |
| `vistorias_do_imovel(property_id)` | L | ✓ | ✓ | ✓ | ✓ se `owner_portal_enabled` | |
| `buscar_proprietario(nome|email|telefone)` | L | ✓ | ✓ | – | – | `profiles` |
| `pendencias_das_listas()` | L | ✓ | ✓ | ✓ | – | ajustes, compras, tarefas de rua |
| `abrir_chamado(property_id, tipo, titulo, descricao)` | E | ✓ | ✓ | ✓ | ✓ tipos de proprietário | mesmo caminho do "Novo ticket" (`notify-ticket`) |
| `responder_chamado(id, mensagem, interna?)` | E | ✓ | ✓ | ✓ | ✓ nunca interna | `create-ticket-message` |
| `mudar_status_chamado(id, status)` | E | ✓ | ✓ | ✓ | – | |
| `registrar_ajuste / registrar_compra / registrar_tarefa_rua` | E | ✓ | ✓ | ✓ | – | §3.13–3.15 do CLAUDE.md, com WhatsApp pelo trigger |
| `criar_manutencao(property_id, titulo, custo, valor?)` | E | ✓ | ✓ | ✓ | – | igual à inclusão rápida da lista |
| `criar_cobranca_rascunho(...)` | E | ✓ | ✓ | – | – | nasce `draft`; **enviar continua pela tela** (Fase 3) |
| `iniciar_bloqueio_de_datas(property_id, de, ate, motivo)` | E | – | – | – | ✓ | cria o pedido e devolve o cartão do fluxo pago (§4). **Não bloqueia.** |
| `hostex_bloquear_datas / hostex_liberar_datas(property_id, de, ate)` | E | ✓ | ✓ | – | – | `POST /availabilities` |
| `hostex_criar_reserva_direta(...)` | E | ✓ | ✓ | – | – | `POST /reservations` com `channel_id` idempotente |
| `hostex_alterar_preco(listing, de, ate, preco)` | E | ✓ | – | – | – | `POST /listing_prices`; faixa de sanidade (±50 % do preço atual) **[DECISÃO]** |
| `hostex_sincronizar()` | E | ✓ | – | – | – | chama `hostex-sync` com token |
| `processar_pedido_de_bloqueio(id, decisao)` | E | ✓ | ✓ | ✓ | – | substitui a fila manual; aprovado → `hostex_bloquear_datas` |

Sem ferramenta para: apagar, mudar papel/perfil, mudar configuração da IA, cancelar reserva de hóspede, mensagem a hóspede (talvez Fase 6, admin), marcar cobrança como paga **[DECISÃO]**, débito em reserva, notificações em massa, exportar.

Cada ferramenta é um objeto em `_shared/ia/ferramentas/*.ts`: `{ nome, descricao, schema (strict, additionalProperties:false), nivel, papeis, executar(ctx, input) }`. A descrição é escrita para o modelo e diz **quando usar e quando não usar** (ex.: "para pedido de bloqueio de datas de proprietário use `iniciar_bloqueio_de_datas`; nunca bloqueie direto").

---

## 4. Bloqueio de datas do proprietário (fluxo pago)

Pedido do gestor: o proprietário escolhe as datas, **paga a taxa de limpeza por QR Code** e a estadia entra na Hostex como **reserva direta**. A IA só abre o fluxo; quem bloqueia é o servidor, depois do pagamento.

```
proprietário (tela ou IA) ─▶ date_block_requests (aguardando_pagamento, valor_cents)
        └─▶ create-bloqueio-pix ─▶ Mercado Pago (external_reference = "bloqueio:<id>")
                                        └─▶ mercadopago-webhook (ramo "bloqueio:")
                                               ├─ confere transaction_amount*100 == valor_cents
                                               ├─ status = pago
                                               └─▶ hostex-bloqueio (token interno) ─▶ POST /v3/reservations
                                                      ├─ ok → processed + hostex_reservation_code
                                                      └─ falha → pago_pendente_hostex + lembrete no painel
```

Peças:
1. **`properties.taxa_limpeza_cents`** (coluna nova; admin preenche em `/propriedades`). Sem valor no imóvel → o fluxo cai na fila manual de hoje, com aviso.
2. **`date_block_requests`** ganha `valor_cents`, `payment_id`, `pago_em`, `hostex_reservation_code`, `erro_hostex`, e os status `aguardando_pagamento`, `pago`, `pago_pendente_hostex` ao lado dos atuais. O trigger `*_preencher` grava autoria. **Pedido novo avisa a equipe** (linha `LembreteBloqueios` no painel) — hoje nada avisa.
3. **`create-bloqueio-pix`**: molde do `create-group-booking-payment` (valida dono por `has_property_access`, valor **do banco**, PIX só). Devolve o QR e o copia-e-cola; o widget e o `DateBlockRequestDialog` mostram o mesmo cartão.
4. **Ramo no `mercadopago-webhook`**: prefixo `bloqueio:` → **compara o valor** (o webhook hoje não compara em nenhum ramo; este nasce comparando) → marca pago → chama `hostex-bloqueio`.
5. **`hostex-bloqueio`** (function interna, `verify_jwt=false` + token do Vault, como `notificar-listas`): `POST /v3/reservations` com `custom_channel_id` do canal **"Uso do proprietário"** (criar na Hostex), `guest_name` = nome do dono, `currency = BRL`, `channel_id = "BLQ" + id` (idempotente), `remarks` com o motivo. **[DÚVIDA]** se a Hostex aceita `rate_amount = 0`; se não, `rate_amount` = taxa de limpeza e `received_amount` igual. Para `maintenance` a equipe decide, e aprovar chama `hostex_bloquear_datas` (disponibilidade), não reserva.
6. **Efeitos colaterais a tratar:**
   - `notificar-reserva` mandaria "reserva confirmada" por WhatsApp ao dono quando a reserva voltar pelo webhook (canal direto vira "contato direto", `notificar-reserva/index.ts:23-30`). Pular reservas do canal "Uso do proprietário", ou trocar por "bloqueio confirmado" **[DECISÃO]**.
   - `resultados_imovel` / `reservas_unificadas` passam a classificar esse canal como **uso próprio**: não entra em diárias nem em ocupação paga, aparece no calendário como "Uso do proprietário".
   - O comprovante manual sai do bucket público `attachments` (CLAUDE.md §8.15); quem pagar por PIX não precisa de comprovante.
7. **Na IA:** `iniciar_bloqueio_de_datas` confere disponibilidade no cache antes (datas já ocupadas → responde sem criar pedido), cria o pedido e devolve o cartão com o QR. Nada de Hostex nessa ferramenta.

---

## 5. Modelo de dados

```sql
-- conversas do assistente
ia_conversas   (id, usuario_id, papel, pagina_inicial, titulo, criada_em, atualizada_em, encerrada_em)
ia_mensagens   (id, conversa_id, ordem, role user|assistant, blocos jsonb,      -- blocos do Claude como vieram
                modelo, effort, stop_reason, tokens_entrada, tokens_saida, tokens_cache_lidos,
                tokens_cache_gravados, latencia_ms, custo_estimado_microusd, criada_em)
ia_acoes       (id, conversa_id, mensagem_id, usuario_id, papel, ferramenta, nivel leitura|escrita,
                property_id, entrada jsonb, resumo text, resultado jsonb (≤ 16 KB, o mesmo que o modelo recebeu),
                status executada|aguardando_confirmacao|confirmada|cancelada|negada|erro|expirada,
                motivo_negada, confirmada_em, executada_em, duracao_ms, erro, criada_em)
-- bloqueio pago
properties.taxa_limpeza_cents
date_block_requests (+ valor_cents, payment_id, pago_em, hostex_reservation_code, erro_hostex, status novos)
-- configuração
system_config.ia_agente = { ativo, modelo, effort, papeis: {...}, cotas: {...}, ferramentas_desligadas: [] }
```
- RLS: `ia_*` com SELECT para o próprio usuário e para admin/agent; **sem INSERT/UPDATE para `authenticated`** (só a function, com service role). `ia_acoes` nunca guarda dado pessoal de hóspede quando o papel é proprietário (o resultado gravado é o que o modelo recebeu).
- Índices: `ia_acoes (usuario_id, criada_em desc)`, `(property_id, criada_em desc)`, `(status)` parcial para `aguardando_confirmacao`; `ia_mensagens (conversa_id, ordem)`.
- `ai_settings`: `temperature` deixa de ser usada; `model` passa a aceitar os ids do Claude; entra `effort`. Os `ai_templates` continuam.

---

## 6. Front-end

- **`AssistenteIA`** montado **uma vez** em `src/App.tsx`, dentro de `AuthProvider`, carregado com `lazy` (regra do chunk inicial, CLAUDE.md §8.8). Aparece para usuário logado com papel habilitado em `system_config.ia_agente`; some nas rotas públicas e em `/debug-app`. No celular, botão acima da `MobileBottomNav` (a posição `bottom-20` do widget atual).
- Reaproveita o kit `src/components/chat/` (`ChatMessageBubble`, `CorpoMensagem`, `ChatDateDivider`). Peças novas em `src/components/ia/`: `CartaoAcao` (confirmar/cancelar, com o resumo e os campos), `CartaoResultado` (link "Ver chamado", "Ver cobrança", QR do bloqueio), `ListaConversas` (histórico), `AvisoCota`.
- Contexto da página: o widget manda `{ rota, params }` a cada mensagem; o modelo recebe "o usuário está em /ticket-detalhes/abc" e pode usar `detalhe_chamado` sem perguntar qual.
- **`/admin/ia-acoes`** (`lazyPage`, admin e agent): tabela com filtros, detalhe em `DetailSheet`, exportar CSV. Linha `LembreteIA` no painel: "N ações de proprietário hoje · M aguardando confirmação há mais de 10 min".
- **`/configuracao-ia`**: lista de modelos vira Claude (`claude-sonnet-5-5` padrão, `claude-haiku-5-5`, `claude-opus-5-5`), temperatura vira effort, "Testar Prompt" passa pela function, e ganha a aba **Agente** (interruptor geral, papéis, cotas, ferramentas desligadas).
- Textos em pt-BR, tokens semânticos, `EmptyState`/`SectionSkeleton` (regras nº 1, 2 e 10).

---

## 7. Fases e esforço

Esforço como no ROADMAP: P = até meio dia · M = 1–2 dias · G = 3+ dias. Cada fase termina publicada e testada no navegador; nenhuma depende de a seguinte existir.

| Fase | Entrega | Esforço | Depende de |
|---|---|---|---|
| **0 — Pré-requisitos** | `ANTHROPIC_API_KEY` no Lovable Cloud; conferir permissão de escrita do `HOSTEX_API_KEY`; criar na Hostex o canal "Uso do proprietário" e anotar `custom_channel_id` e `income_method_id`; redeploys pendentes (§8) | P (você) | — |
| **1 — Claude no ar e vazamento fechado** | `_shared/ia/claude.ts`; `ia-agente` **só leitura**, para a equipe, com `exigirPapel`, RLS, cotas e as três tabelas de log; widget novo em todas as páginas da equipe, com histórico; `ai-consulta` desligada e `AIAssistantWidget`/`ai-assistant` apagados; `ai-generate-response` migrado (corrige o bug de `ai_settings` para agent/maintenance); `/configuracao-ia` com modelo/effort. **Código pronto em 2026-10-30** (CLAUDE.md §3.20); falta o secret, o deploy pelo Lovable e ligar em `/configuracao-ia` → Agente. A function `ai-assistant` ficou no repositório como estava (remover pelo agente do Lovable, que também tira a entrada do `config.toml`) | **M** | 0 |
| **2 — Proprietário no chat** | Ferramentas de leitura com escopo (`has_property_access`), sem dado de hóspede; widget visível ao proprietário; contexto de página; piloto com 2–3 proprietários; policies §1.5 fechadas (`hostex_properties`, `Owners can read own hostex_reservations`) | **M** | 1 |
| **3 — Ações no portal com confirmação** | Ferramentas de escrita (chamado, resposta, ajustes/compras/tarefas, manutenção, rascunho de cobrança), `CartaoAcao`, retomada do laço após confirmar, `/admin/ia-acoes`, `LembreteIA`. **Parcial em 2026-10-31:** `abrir_chamado`, `responder_chamado`, `mudar_status_chamado`, `registrar_ajuste/compra/tarefa_rua` prontos (`ferramentas-escrita.ts`); faltam manutenção, rascunho de cobrança, `/admin/ia-acoes` e `LembreteIA` | **M/G** | 2 |
| **4 — Ações Hostex para a equipe** | `_shared/hostex.ts` único; `hostex_bloquear/liberar_datas`, `hostex_criar_reserva_direta`, `hostex_alterar_preco` (admin), `processar_pedido_de_bloqueio`; teste em imóvel sem anúncio; webhook traz o resultado de volta. **Parcial em 2026-10-31:** `hostex_bloquear_datas` e `hostex_liberar_datas` prontos (`hostexPost` em `hostexReserva.ts`); a permissão de escrita da chave se confirma no primeiro uso real | **M** | 0, 3 |
| **5 — Bloqueio pago do proprietário** | `taxa_limpeza_cents`, `create-bloqueio-pix`, ramo no webhook com conferência de valor, `hostex-bloqueio`, exclusão em `notificar-reserva`, uso próprio em `resultados_imovel`, `LembreteBloqueios`, comprovante fora do bucket público, `iniciar_bloqueio_de_datas` na IA. **Feito em 2026-10-31 (CLAUDE.md §3.21):** taxa no imóvel, `create-bloqueio-pix` com checagem de calendário ao vivo, ramo `bloqueio:` no webhook bloqueando por `POST /availabilities` (sem reserva direta: a conta não tem canal personalizado), diálogo com QR e copia e cola, fila e lembrete. Ficam: reserva direta (se o gestor criar o canal), `iniciar_bloqueio_de_datas` (Fase 2) | **G** | 4 |
| **6 — Resto da migração e acabamento** | `curadoria-ai` e `parse-ficha-anuncio` em saída estruturada; `summarize-*`, `daily-summary` (corrigir `userId` do corpo), `parse-inspection-problem`, `bulk-edit-fichas` no módulo comum; `generate-service-summary` apagada ou guardada; `transcribe-audio` decide STT; desligar `LOVABLE_API_KEY`/`OPENAI_API_KEY`; streaming no widget; conjunto de 30 perguntas de avaliação por papel rodado antes de cada mudança de prompt | **M** | 1 |

Ordem sugerida: 0 → 1 → 2 → 3 → 4 → 5 → 6. A Fase 1 sozinha já entrega o pedido "trocar GPT por Claude" e fecha o vazamento.

---

## 8. O que depende de você

1. **`ANTHROPIC_API_KEY`** — criar em console.anthropic.com (Settings → API keys) e guardar em Lovable → Mais → Cloud → Secrets. Confirmar lá se o crédito de US$ 200 do plano vale para a API.
2. **Hostex** — confirmar que o token tem escrita (ou gerar um com escrita); criar o canal personalizado "Uso do proprietário" e um método de recebimento; me passar os dois ids (ou eu leio por `GET /custom_channels` e `/income_methods` quando o token permitir).
3. **Redeploys pendentes pelo agente do Lovable** (o código está no repositório, a versão no ar é antiga): `hostex-sync` e `hostex-proxy` (CLAUDE.md §3.6), `notificar-listas` modo `lote_email` (§3.19), `create-ticket-message` (§3.10) e `notify-mentions` (§3.10). Cada pedido consome ~0,9 crédito.
4. **"Os códigos que eu pedi"** — candidatos, por ordem de probabilidade: `PRICELABS_API_KEY` (§3.12; você preferiu não gerar, a carga do mercado segue manual), o `INTERNAL_FUNCTION_TOKEN` do ROADMAP 1.5 (guarda das `notify-*` e `send-push`; parte disso já foi resolvida pelo token do Vault), ou os redeploys acima. Diga qual era e eu fecho.
5. **[DECISÃO]** faxineira usa o assistente? marcar cobrança como paga pela IA? faixa de sanidade de preço? WhatsApp "bloqueio confirmado" ao dono? cotas iniciais?
6. **`ROADMAP.md` × `roadmap.md`** — o Lovable criou `roadmap.md` em 2026-10-30 (commit `60938a9`) e no Windows os dois nomes são o mesmo arquivo: o `ROADMAP.md` de 724 linhas aparece "modificado" no disco (o conteúdo continua no Git). Não commitar essa diferença. Resolver renomeando um dos dois (sugestão: o do Lovable vira `TAREFAS_LOVABLE.md`, ou pedir ao agente dele para usar outro nome).

---

## 9. Riscos e dúvidas

- **Hostex não é transacional**: `update_availabilities` é assíncrono e cascata para todos os canais; errar data fecha o imóvel ou atropela reserva. Por isso confirmação obrigatória, datas sempre no cartão, e `channel_id` idempotente na reserva.
- **Injeção de prompt**: conteúdo de chamado, cobrança e descrição de reserva entra no `tool_result`. O system prompt deixa claro que resultado de ferramenta é dado, não instrução; a política e a RLS valem mesmo que o modelo "queira" outra coisa; escrita sempre passa pela pessoa.
- **Recusas do Sonnet 5.5** (`stop_reason: refusal`, categorias `general_harms` etc.) podem pegar texto benigno; tratar com mensagem clara e registrar em `ia_mensagens` para medir.
- **Versão publicada ≠ repositório** (CLAUDE.md §7): cada fase termina com a sonda via `pg_net` que já usamos para conferir a versão no ar.
- **Custo** só se mede com o log; a cota inicial é chute e deve ser revista em duas semanas.
- **[DÚVIDA]** limite de tempo da edge function no Lovable Cloud; **[DÚVIDA]** `rate_amount = 0` em reserva direta; **[DÚVIDA]** se o `hostex-proxy` ao vivo com `/listings/calendars` (GET) funciona — a sync usa `/listings/calendar` (POST).
- `profiles.role` continua sendo a fonte do papel (regra nº 7 do CLAUDE.md ainda em aberto): a política da IA herda esse risco.

---

## Anexo A — Esqueleto da chamada (Deno, `_shared/ia/claude.ts`)

```ts
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

export async function perguntar(p: {
  system: string;                       // fixo por papel, cacheado
  tools: Anthropic.Tool[];              // já filtradas pela política, ordem determinística, strict: true
  messages: Anthropic.MessageParam[];   // histórico só anexado, blocos como vieram
  effort?: "low" | "medium" | "high";
}) {
  const r = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: p.effort ?? "medium" },
    system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
    tools: p.tools,
    messages: p.messages,
  });
  if (r.stop_reason === "refusal") return { recusa: r.stop_details?.category ?? "desconhecida", r };
  return { r }; // o chamador lê r.content por tipo: thinking | text | tool_use
}
```
Laço em `ia-agente`: enquanto `stop_reason === "tool_use"` (até 8 vezes): para cada `tool_use`, `politica.avaliar(ctx, nome, input)` → `leitura` executa e junta `tool_result`; `escrita` grava `ia_acoes (aguardando_confirmacao)` e **devolve** ao widget. Todos os `tool_result` de uma rodada voltam numa única mensagem `user`.

## Anexo B — Limpeza que vem junto

- Apagar `src/components/AIAssistantWidget.tsx` e `supabase/functions/ai-assistant/` (mortos, OpenAI).
- Apagar ou guardar `generate-service-summary` (`verify_jwt=false`, sem chamador).
- `daily-summary`: trocar o `userId` do corpo pelo usuário do token.
- `ConfiguracaoIA.tsx:214-231`: tirar a chave do navegador.
- `hostex-proxy`, `hostex-sync`, `hostexReserva.ts`: uma só definição de base/header/`conferirRespostaHostex`.
- `AdminBloqueiosDatas.tsx:85-100`: gravar `processed_by` e chamar a Hostex (vira `processar_pedido_de_bloqueio`).
