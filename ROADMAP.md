# ROADMAP — Portal RIOS Hospedagens

Auditoria de **2026-09-18** sobre o commit `4c49831`. Nada foi implementado.
Contexto de arquitetura: `CLAUDE.md`.

**Foco:** segurança primeiro, depois velocidade, design e a experiência do proprietário no celular.

**Esforço:** P = até meio dia · M = 1–2 dias · G = 3+ dias

---

## ⚠️ Antes de qualquer item da Onda 1

`supabase/migrations/` **não reflete o banco vivo**. As conclusões de RLS abaixo vêm da leitura das migrations e precisam ser confirmadas em produção:

```sql
-- policies reais em profiles
select policyname, cmd, qual, with_check from pg_policies where tablename = 'profiles';

-- role e payment_score são colunas de profiles?
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name in ('role','payment_score','curation_only');

-- existe trigger guardando mudança de role?
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid='public.profiles'::regclass and not tgisinternal;
```

As falhas de **edge function** (1.1, 1.2, 1.3) **não dependem dessa confirmação** — o código é conclusivo.

---

# Onda 1 — Segurança 🔴

> Os quatro primeiros itens são exploráveis por qualquer pessoa na internet, sem conta.

### 1.1 — `admin-reset-password`: tomada de conta anônima `[P]` ✅ **RESOLVIDO em 2026-09-18**

> **Fechado e verificado.** A função foi apagada do backend, do repositório e do `config.toml` (commit `5c26493`, via agente do Lovable). Verificação independente: um POST no endpoint agora responde `{"code":"NOT_FOUND","message":"Requested function was not found"}` — o gateway do Supabase dizendo que a função não existe, e não mais o código vulnerável rodando. Controle feito com `send-push` (respondeu 500) confirma que o gateway está no ar e o 404 é remoção real.
>
> Nos 5 dias anteriores à remoção (janela máxima que o painel mostra) houve 3 invocações, todas minhas, de teste. Não cobre maio–setembro, então **não é possível afirmar que nunca foi explorada** — apenas que não houve uso recente.
>
> Registro do que era, para referência:

**Problema.** 23 linhas que recebem `email` + `newPassword` e chamam `auth.admin.updateUserById` com a service role key. `verify_jwt = false`, sem segredo, sem checagem de papel. Qualquer pessoa troca a senha de **qualquer conta, inclusive admin**, com um POST. Não precisa estar logada.

**Evidência.** `supabase/functions/admin-reset-password/index.ts:3-22`; `supabase/config.toml` → `[functions.admin-reset-password] verify_jwt = false`. No repositório desde `1a10a82` (13/05/2026). **Nenhum arquivo do front a chama.**

**Proposta.** Apagar a função. Não tem uso; reset de senha já existe pelo fluxo normal do Supabase.

> **Apagar do repositório não basta** — a função já está publicada e continua respondendo. Remover primeiro no **Supabase → Edge Functions → `admin-reset-password` → Delete** (efeito imediato, sem deploy), depois remover a pasta e a entrada do `config.toml` aqui, para não voltar no próximo deploy do Lovable.

Se houver motivo para mantê-la: `verify_jwt = true` + checagem de `has_role(admin)` + log de auditoria.

**Arquivos.** `supabase/functions/admin-reset-password/`, `supabase/config.toml`.

**Risco de regressão.** Nenhum — ninguém chama.

**Como validar.** `curl -X POST <url>/functions/v1/admin-reset-password -d '{"email":"...","newPassword":"..."}'` → deve dar 404. Confirmar que o "esqueci minha senha" normal continua funcionando.

---

### 1.2 — Curadoria pode ser paga por R$ 1,00 `[M]` 🔴

**Problema.** O valor do PIX vem **do corpo da requisição**, não do banco. Nada compara com o preço real dos itens, em nenhuma etapa:

1. `create-curation-pix` é pública e aceita `total_amount_cents` do cliente (`index.ts:19`), usa como `transaction_amount` (`:48,59`) e grava no banco (`:98`). A única validação é `< 100` — ou seja, R$ 1,00 passa.
2. `save-curation-selection` também é pública e grava `total_amount_cents` cru (`index.ts:41`).
3. O webhook marca a curadoria como paga sem nunca comparar `payment.transaction_amount` (`mercadopago-webhook/index.ts:163-215`).

O próprio código assume que não há risco: *"Sem checagem de ownership — basta a curadoria existir e estar publicada"* (`create-curation-pix/index.ts:24-25`). O problema não é só ownership — é o valor.

**Consequência.** Uma curadoria de R$ 8.000 pode ser quitada com R$ 1,00, e o sistema emite o ticket de compra normalmente. Sem login.

**Proposta.**
1. Calcular o total **no servidor**, a partir de `selected_items` e dos preços em `owner_curations`. Ignorar qualquer valor vindo do cliente.
2. Exigir autenticação nas duas funções (`verify_jwt = true`) e conferir `auth.uid() === curation.owner_id`, ou aceitar um token de curadoria de uso único (ver 1.3).
3. No webhook, comparar `transaction_amount * 100` com `owner_curations.total_amount_cents`; divergência → não marcar paga, registrar e alertar a equipe.

**Arquivos.** `supabase/functions/create-curation-pix/index.ts`, `save-curation-selection/index.ts`, `mercadopago-webhook/index.ts`, `supabase/config.toml`.

**Risco de regressão.** Médio-alto — caminho do dinheiro. Testar em sandbox do MP.

**Verificar se já aconteceu:**

```sql
select id, title, total_amount_cents, paid_at, mercadopago_payment_id
from owner_curations where paid_at is not null order by paid_at desc;
```
Conferir cada valor contra o pagamento correspondente no painel do Mercado Pago.

**Como validar.** Forjar `total_amount_cents: 100` numa curadoria de teste → deve ser rejeitado.

---

### 1.3 — `curation-access`: link de e-mail vira login permanente `[P]` 🔴

**Problema.** O comentário no topo diz "Token never expires; it's single-use". O código lê `used_at` (`index.ts:25`) mas **nunca o verifica** — a condição em `:29` só checa se a linha existe. A marcação de uso em `:57-60` é explicitamente "best-effort". Resultado: o token nunca expira **e** é reutilizável para sempre. Cada clique gera um magic link novo e loga como aquele proprietário.

Um e-mail de curadoria encaminhado, num histórico de navegador, num backup de caixa postal ou num log de provedor = acesso permanente à conta.

Agravante: o token trafega na query string (`?token=`), que costuma acabar em log de servidor e header `Referer`.

**Evidência.** `supabase/functions/curation-access/index.ts:4-6` (comentário), `:23-31` (checagem sem `used_at`), `:56-60`.

**Proposta.** Rejeitar token com `used_at` preenchido. Adicionar `expires_at` (sugestão: 7 dias) e rejeitar vencido. Marcar como usado **antes** de gerar o link, numa escrita condicional (`update ... where id = ? and used_at is null` e conferir que afetou 1 linha), para não haver corrida. Trocar a query string por POST, ou aceitar que é one-time e tratar o token como consumido no primeiro uso.

**Arquivos.** `supabase/functions/curation-access/index.ts`, migration para `expires_at`.

**Risco de regressão.** Baixo — mas proprietários que guardaram o link antigo vão precisar de um novo. Vale avisar a equipe.

**Como validar.** Clicar duas vezes no mesmo link: a segunda deve cair em `/login?error=token_invalido`.

**Limpeza:** invalidar os tokens já emitidos —
`update curation_access_tokens set used_at = now() where used_at is null;`

---

### 1.4 — Escalação de privilégio via `profiles` `[G]` 🔴

**Problema.** A policy de UPDATE em `profiles` autoriza o usuário a alterar a própria linha inteira, sem `WITH CHECK` e sem restrição de coluna. `role`, `payment_score` e `curation_only` são colunas dessa linha. Como toda policy de admin passa por `has_role()`, que lê `profiles.role`, um proprietário logado pode se promover a admin e ler o financeiro de todos.

**Evidência.** `supabase/migrations/20251026001141_*.sql:136-138`; `role` como coluna em `:11`; `has_role()` em `:98-110`. Em **171 migrations**: nenhuma revisão dessa policy, nenhuma tabela `user_roles`, nenhum trigger com `NEW.role`.

**Proposta.** Duas etapas:

1. **Contenção (P).** Trigger `BEFORE UPDATE` em `profiles` rejeitando alteração de `role`, `status`, `payment_score` e `curation_only` quando o autor é o próprio dono da linha e não é admin. Recriar a policy com `WITH CHECK` explícito.
2. **Estrutural (G).** Migrar para `user_roles (user_id, role)` com RLS de escrita só para admin, reescrever `has_role()`/`is_team_member()` sobre ela, manter `profiles.role` como espelho somente-leitura até o front migrar. Passa a cumprir a regra nº 7.

**Arquivos.** Migration nova; depois `ProtectedRoute.tsx`, `useAuth.tsx`, `Index.tsx` e as referências a `profile.role`.

**Risco de regressão.** Alto na etapa 2, baixo na 1. **Fazer a 1 agora.**

**Como validar.** Com um `owner` de teste, `supabase.from('profiles').update({role:'admin'}).eq('id', meuId)` deve falhar. Admin continua promovendo em `/admin/gerenciar-usuarios`. Testar login dos 6 papéis + `curation_only`.

---

### 1.5 — `send-push` e as `notify-*` abertas `[M]` 🟠

**Problema.** Sem JWT e sem nenhuma outra checagem, com service role:
`send-push` (aceita `ownerId` + `title`/`body`/`url` arbitrários → push de phishing com a marca RIOS para qualquer usuário), `notify-ticket`, `notify-owner-decision`, `notify-curation-paid`, `notify-booking-commission`, `notify-booking-commission-paid`, `generate-service-summary`, `migrate-attachments`, `owner-decision-cron`.

**Evidência.** `supabase/config.toml`; `send-push/index.ts:76`; `owner-decision-cron/index.ts` (nenhuma verificação de token).

**Proposta.** Segredo compartilhado (`X-Internal-Token`) para as chamadas servidor-a-servidor; `verify_jwt = true` + validação de `ownerId === auth.uid()` para a única chamada do cliente (`EnablePushNative.tsx`); `verify_jwt = true` + `has_role(admin)` em `migrate-attachments`; token de cron em `owner-decision-cron` (copiar o padrão de `charge-cron`, que já faz certo).

**Arquivos.** `supabase/config.toml`, as 9 funções e seus chamadores.

**Risco de regressão.** Médio — se esquecer um chamador, e-mail ou push param em silêncio (todos usam `try/catch` que só loga). Revisar os chamadores junto.

**Como validar.** `curl` anônimo → 401 em todas. Depois, percorrer os fluxos: abrir chamado, aprovar proposta, pagar cobrança, decisão de manutenção.

---

### 1.6 — `hostex-sync`: o token é pulado com `?force=1` `[P]` 🟠

**Problema.** `if (!force) { checa token }` — e `force` vem da query string ou do corpo. O comentário diz que o modo manual é protegido por JWT, mas `config.toml` põe `verify_jwt = false`. Então `?force=1` dispara sincronização completa sem credencial: custo na API Hostex e reescrita de reservas.

**Evidência.** `supabase/functions/hostex-sync/index.ts:85-97`; `supabase/config.toml`.

**Proposta.** Exigir o token de cron **sempre**; para o disparo manual da UI, `verify_jwt = true` + `has_role(admin)`.

**Risco.** Baixo. **Validar:** `curl "<url>/hostex-sync?force=1"` → 401.

---

### 1.7 — `ProtectedRoute` libera quem não tem perfil `[P]` 🟠

**Problema.** `profile &&` faz a checagem de papel ser pulada quando o perfil é nulo (rede caiu, RLS negou, timeout) — e a rota renderiza. O gate de `curation_only` tem o mesmo defeito: `profile?.curation_only` também é falso com perfil nulo, então um usuário restrito sem perfil carregado alcança qualquer tela.

**Evidência.** `src/components/ProtectedRoute.tsx:26-31` e `:33`.

**Proposta.** Negar por padrão: sem `profile`, renderizar erro com "Tentar novamente" e "Sair", nunca o `children`. Expor `profileError` no `useAuth` para distinguir "carregando" de "falhou".

**Risco.** Baixo. Conferir antes se existe usuário legítimo sem linha em `profiles`:
`select count(*) from auth.users u left join profiles p on p.id=u.id where p.id is null;`

**Validar.** Bloquear a request de `profiles` no DevTools → erro com saída, não a tela protegida.

---

### 1.8 — Webhook do MP: idempotência frágil e valor não conferido `[M]` 🟠

**Problema.** O check-then-insert foi adicionado desde a auditoria anterior, mas continua frágil:
- Sem constraint única, duas reentregas simultâneas passam as duas pela checagem e inserem as duas.
- `maybeSingle()` erra quando já existem 2+ linhas para a mesma charge — o erro é ignorado, `existingPayment` fica nulo e uma terceira linha é inserida.
- `transaction_amount` nunca é comparado com `charge.amount_cents`.
- Erro devolve **500** (`index.ts` final), o que faz o MP reentregar.
- Sem validação de assinatura `x-signature` (0 ocorrências). Mitigado porque a função rebusca o pagamento na API do MP em vez de confiar no corpo — mas é a única barreira.

**Evidência.** `supabase/functions/mercadopago-webhook/index.ts:579-600` e `:707-728`.

**Proposta.** Coluna `mercadopago_payment_id` em `charge_payments` + índice único + `upsert onConflict`. Conferir valor. Devolver 200 em erro tratado. Validar `x-signature`.

**Risco.** Médio-alto. Limpar duplicatas antes da constraint:

```sql
select charge_id, count(*), sum(amount_cents) from charge_payments
where method='mercadopago' group by charge_id having count(*) > 1;
```

**Validar.** Reenviar a mesma notificação 3x pelo painel do MP → 1 linha em `charge_payments`.

---

### 1.10 — `seed-test-lead` entrega credenciais válidas a qualquer um `[P]` 🔴🔴 **AGORA**

**Problema.** `seed-test-lead` é uma das funções órfãs (item 1.9). Um POST **anônimo, com corpo vazio**, responde HTTP 200 com:

```json
{"ok":true,"userId":"ab402c87-7961-4f09-8e28-3b1d9ecbf220","email":"teste@rios.com","password":"teste123"}
```

Ela repõe a senha da conta `teste@rios.com` para `teste123` **e devolve a senha na resposta**. Qualquer pessoa na internet obtém um login funcional no portal, quantas vezes quiser.

**Evidência.** Sondagem direta ao endpoint em 2026-09-18. A conta existe em `auth.users` desde 2026-04-30; `updated_at` muda a cada chamada, confirmando que a senha é reposta. Último login legítimo: 2026-04-30.

**Por que é pior do que parece — a cadeia:**

1. Qualquer um pega credenciais válidas em `seed-test-lead`.
2. A conta **não tem linha em `profiles`**. Pelo item 1.7, `ProtectedRoute.tsx:33` pula a checagem de papel quando o perfil é nulo — então ela **alcança qualquer tela do portal**, inclusive as de admin.
3. Com um JWT válido em mãos, as funções `verify_jwt = true` passam a aceitá-la. E **`debit-reserve` não checa papel nenhum** (`supabase/functions/debit-reserve/index.ts:29-50`: lê `chargeIds` e valores financeiros do corpo e executa com service role). `credit-manual` idem.

O RLS ainda limita a *leitura* de dados (as policies passam por `has_role()`, que retorna falso sem perfil), mas a combinação "login público + função financeira sem checagem de papel" é suficiente para dano.

**Proposta, em ordem:**
1. **Apagar `seed-test-lead`** do backend (agente do Lovable).
2. **Remover ou bloquear a conta `teste@rios.com`** — ela não tem perfil e não é usada desde abril.
3. Adicionar checagem de papel em `debit-reserve` e `credit-manual` (admin/maintenance).
4. Corrigir o item 1.7 (`ProtectedRoute`), que é o que transforma "conta sem perfil" em "acesso a tudo".

**Risco de regressão.** Nenhum nos passos 1 e 2 (função de teste, conta de teste). Passos 3 e 4 exigem testar os fluxos de débito em reserva e login dos 6 papéis.

**Como validar.** POST anônimo em `seed-test-lead` → 404. Login com `teste@rios.com` → falha.

> **Nota de procedimento.** Este achado veio de uma sondagem com corpo vazio, feita esperando um erro de validação. A função executou e repôs a senha da conta. Ou seja: a senha `teste123` está ativa **agora** por causa dessa verificação. A conta já existia e já era obtenível por qualquer um antes disso — a falha não foi criada, só ficou com credencial fresca.

---

### 1.9 — Funções publicadas sem código no repositório `[M]` 🔴 **descoberto em 2026-09-18**

**Problema.** O painel do Lovable Cloud lista **74 edge functions publicadas**; o repositório tem **70**. Quatro rodam na internet sem código nenhum no Git:

`create-user` · `process-all-videos` · `process-video` · `seed-test-lead`

São endpoints HTTP vivos, com service role, que **não aparecem em nenhuma revisão de código** — nem nesta auditoria, que foi toda baseada no repositório. `create-user` e `seed-test-lead` são exatamente a categoria de utilitário esquecido que o `admin-reset-password` era: nomes de ferramenta interna, provavelmente sem autenticação, publicados e abandonados. `create-user` foi atualizado pela última vez em **8 de novembro de 2025**; `process-video` e `process-all-videos` em 13 de novembro de 2025; `seed-test-lead` em 30 de abril de 2026.

**Evidência.** Lovable → Mais → Cloud → Edge functions (74 linhas) vs `ls supabase/functions` (70). Nenhuma das quatro tem pasta em `supabase/functions/`.

**Por que é grave.** Enquanto existir código publicado fora do Git, **nenhuma auditoria de repositório é completa** — inclusive esta. É a mesma classe de problema do item 4.1 (migrations não refletem o banco): a fonte da verdade está fora do controle de versão.

**Sondagem feita em 2026-09-18** (POST anônimo, corpo vazio):

| Função | Resposta | Situação |
|---|---|---|
| `create-user` | 401 `UNAUTHORIZED_NO_AUTH_HEADER` | exige JWT — ok |
| `process-video` | 401 | exige JWT — ok |
| `process-all-videos` | 401 | exige JWT — ok |
| **`seed-test-lead`** | **200 + credenciais** | 🔴 ver item 1.10 |

O "View code" do painel **não serve** para funções órfãs: ele aponta para o caminho no repositório, que não existe. Ler o código delas exigiria a API de gestão do Supabase, indisponível no Lovable Cloud.

**Proposta.**
1. Apagar `seed-test-lead` (item 1.10) e as `process-*`, se o processamento de vídeo não for mais usado.
2. Decidir sobre `create-user`: está protegida por JWT, mas o código não é auditável. Ou trazer para o repositório, ou apagar se `create-owner`/`create-team-member`/`create-cleaner` já a substituíram.
3. Estabelecer a regra: toda function publicada tem código no Git. Conferir periodicamente a contagem do painel contra `ls supabase/functions`.

**Risco.** Apagar exige confirmar antes que nada as chama. Como o código não é legível, confirmar pelo painel: métricas de invocação em janela longa.

**Como validar.** Contagem do painel == contagem do repositório.

---

# Onda 2 — Velocidade

### 2.1 — Code-splitting por rota `[M]` 🔴 **maior ganho isolado**

**Problema.** 91 páginas importadas estaticamente, zero `lazy()`. Build de produção: **4,4 MB num único chunk JS (1,22 MB gzip)** + 143 KB de CSS. O próprio Vite avisa. Um proprietário no 4G baixa o admin inteiro, os Kanbans, a central Hostex e os relatórios para ver a caixa de entrada. Cresceu 2,4× desde dezembro (era 1,9 MB / 516 KB) e piora a cada tela nova.

**Evidência.** `src/App.tsx` (91 imports estáticos, nenhum `lazy`); `dist/assets/index-DOX5TPKC.js` = 4,4 MB.

**Proposta.** `React.lazy()` + `<Suspense>` em todas as rotas, mantendo só `Login`, `Index` e `MinhaCaixa` no chunk inicial. `manualChunks` no Vite separando `framer-motion`, `recharts`, `jszip` e `@radix-ui`. Fallback = skeleton, não tela cheia.

**Risco.** Baixo-médio. Atenção: chunk antigo em cache após deploy gera erro de import dinâmico — tratar com retry/reload no error boundary.

**Validar.** `npm run build` e comparar. Meta: chunk inicial **< 250 KB gzip**. Lighthouse mobile em `/minha-caixa` antes/depois.

---

### 2.2 — Matar o N+1 de manutenções `[P]` 🔴

**Problema.** Busca todas as charges (sem `limit`, sem paginação, `select("*")`) e dispara uma query de `charge_payments` por charge. 300 manutenções = 301 requisições.

**Evidência.** `src/hooks/useMaintenances.ts:84-94`; query sem limite em `:46`.

**Proposta.** Agregar `charge_payments` por `charge_id` numa view ou embed do PostgREST. Trocar `select("*")` pelas colunas usadas. Adicionar `.range()`.

**Risco.** Baixo — conferir que `paid_cents` bate numa amostra.

**Validar.** Network em `/manutencoes`: de N+1 para 1–2 requisições.

---

### 2.3 — Configurar o React Query `[P]` 🟠

**Problema.** `new QueryClient()` sem opções (`src/App.tsx:102`) → `staleTime: 0`, refetch em toda montagem.

**Proposta.** `staleTime` 30–60s, `gcTime` maior, `refetchOnWindowFocus: false` (péssimo em mobile), `retry: 1`. Manter `staleTime: 0` nos chats.

**Risco.** Baixo. **Validar:** alternar entre telas do proprietário sem refetch dentro da janela.

---

### 2.4 — `loading="lazy"` e dimensões nas imagens `[P]` 🟠

**Problema.** 80 `<img>`, **1** com `loading="lazy"`. Nenhuma com `width`/`height` — galeria de anexos baixa tudo de uma vez e a página pula (CLS).

**Proposta.** `loading="lazy"` + `decoding="async"` + `aspect-ratio` fora da primeira dobra; `eager` só no logo.

**Risco.** Baixo. **Validar:** throttle 3G numa cobrança com 20 anexos — só as visíveis baixam.

---

### 2.5 — Paginação `[M]` 🟠

**Problema.** Só **4** `.range()` em 92 páginas. Listas grandes (`/todos-tickets`, `/gerenciar-cobrancas`, `/admin/manutencoes-lista`, `/admin/relatorio-booking`) buscam a tabela toda.

**Proposta.** `.range()` + `count:'exact'` nas listas da equipe; `useInfiniteQuery` nas do proprietário. Índices em `created_at`, `owner_id`, `status`.

**Risco.** Médio — muda filtro e ordenação. Uma tela por vez.

**Validar.** Semear ~5.000 charges em staging e medir antes/depois.

---

# Onda 3 — Design e mobile do proprietário

### 3.1 — Criar `EmptyState` e `SectionSkeleton` `[P]` 🟠

**Problema.** A regra nº 2 exige dois componentes que **não existem**. Resultado: 34 "Carregando" soltos e estados vazios improvisados, cada tela de um jeito.

**Bom ponto de partida:** os tokens `success`/`warning`/`info` **já existem** (`tailwind.config.ts:34-45`) e há `SkeletonLoading.tsx` + o `Skeleton` do shadcn em 26 arquivos — dá para padronizar em cima do que já tem.

**Proposta.** `EmptyState` (ícone lucide, título, descrição, ação opcional, sem emoji) e `SectionSkeleton` (variantes lista, card, tabela, kanban). Depois, substituir os 34 "Carregando" e os vazios improvisados.

**Risco.** Nenhum na criação; baixo na substituição.

---

### 3.2 — Limpar as 804 cores cruas `[G]` 🟠

**Problema.** 804 ocorrências fora de `ui/`. Telas equivalentes de admin e proprietário usam verdes e âmbares diferentes para o mesmo significado. **Agora não há mais desculpa** — os tokens existem.

**Proposta.** Em lotes, começando pelo proprietário (`CobrancaDetalhes`, `MinhasCobrancas`, `MinhaCuradoria`, `MinhasComissoesBooking`), depois equipe, depois Kanbans. Definir um mapa único status → token (pago = `success`, vencido = `destructive`, aguardando = `warning`, informativo = `info`) e aplicar dos dois lados. Manter `OwnerScoreDisplay` como exceção.

Fechar com regra de ESLint barrando cor crua fora de `src/components/ui/` e da exceção, para a dívida não voltar no próximo prompt do Lovable.

**Risco.** Baixo por arquivo, alto se feito de uma vez. Uma tela por PR.

**Validar.** Comparação visual claro/escuro; contagem caindo a cada lote; lint acusando uma cor crua inserida de propósito.

---

### 3.3 — Acessibilidade dos botões de ícone `[M]` 🟠

**Problema.** **132** botões `size="icon"` e apenas **25** `aria-label` em todo o app. Leitor de tela anuncia "botão" sem dizer o quê.

**Proposta.** `aria-label` em todo botão sem texto visível, começando pelas telas do proprietário e pelo `MobileBottomNav`/`MobileHeader`. Conferir alvo de toque ≥ 44px.

**Risco.** Nenhum — é atributo.

**Validar.** VoiceOver (iOS) e TalkBack (Android) percorrendo `/minha-caixa`.

---

### 3.4 — Anonimizar nome de anexo `[P]` 🟠

**Problema.** Viola a regra nº 4. O `file_name` original aparece para o proprietário e vai no atributo `download` — vaza nome de fornecedor, de orçamento, o que estiver no arquivo.

**Evidência.** `src/components/AttachmentBubble.tsx` (5 usos de `file_name`), `MediaGallery.tsx`.

**Proposta.** Helper `rotuloAnexo(mime, index)` → "Imagem 1", "Vídeo 2", "PDF". Usar na exibição **e** no `download`. `file_name` real fica só no banco, para a equipe.

**Risco.** Baixo. Confirmar se algum fluxo da equipe depende de ver o nome real.

---

### 3.5 — Safe area do iOS `[P]` 🟠

**Problema.** Só 2 referências a `safe-area-inset` e `index.html:6` sem `viewport-fit=cover`. Com a `MobileBottomNav` ativa, a barra fica sob a barra de gestos do iPhone.

**Proposta.** `viewport-fit=cover` no meta + `env(safe-area-inset-bottom)` na nav e `env(safe-area-inset-top)` no header.

**Validar.** iPhone com notch, retrato e paisagem.

---

### 3.6 — Higiene `[P]` 🟡

`lang="pt-BR"` no `index.html:2` · remover os 75 `console.log` (ou passar por wrapper que só fala em dev) · padronizar o voltar com `replace: true`.

> Os metadados Open Graph **já foram corrigidos** — hoje mostram a marca RIOS.

---

# Onda 4 — Estrutural

### 4.1 — Fonte da verdade do schema `[M]` 🔴 **destrava a auditoria de segurança**

**Problema.** As migrations não descrevem o banco. Enquanto isso for verdade, não dá para afirmar nada sobre RLS por leitura de código.

**Proposta.** `supabase db pull` para gerar um baseline do estado real; arquivar as migrations divergentes em `_legacy/`; passar a exigir migration para toda mudança, inclusive as do Lovable. Depois, revisar as policies de todas as tabelas com dado financeiro: `charges`, `charge_payments`, `booking_commissions`, `financial_reports`, `owner_credits`, `owner_curations`, `contracts`.

**Validar.** `supabase db diff` sem diferenças após o baseline.

---

### 4.2 — Consertar o `npm install` `[P]` ⚠️ **PARCIAL — 2026-09-18**

> **Feito:** `@capacitor/camera` → `^7.0.5` e `@capacitor/filesystem` → `^7.1.8` (commit `5c26493`).
> **Falta:** `@capawesome/capacitor-file-picker` continua em `^8.0.0` e também exige `@capacitor/core >=8.0.0`. Confirmado rodando `npm install --dry-run`: ainda falha com ERESOLVE. O build do Lovable passa porque usa **bun**, que é permissivo com peer dependency — por isso o problema não aparece lá. Correção pedida ao agente do Lovable (baixar para `^7.2.0`), **mensagem na fila, aguardando a fila ser despausada**.

**Problema.** Pacotes da família Capacitor em v8 exigem `@capacitor/core >=8.0.0`, mas o projeto está em `^7.4.4` (com android, ios, cli e push-notifications também em 7.x). `npm install` falha com ERESOLVE numa instalação limpa. Só passa com `--legacy-peer-deps` — o que faz o plugin rodar contra um core que ele não declara suportar.

**Consequência.** Dev novo não instala. CI/deploy limpo quebra. E a câmera (fotos de vistoria) pode falhar em runtime no app nativo.

**Proposta.** Alinhar: ou `@capacitor/camera@^7`, ou subir toda a stack Capacitor para 8 (exige revalidar o build Android/iOS). Escolher também **um** gerenciador de pacotes — coexistem `bun.lockb` e `package-lock.json`.

**Validar.** `rm -rf node_modules && npm install` sem flag → sucesso. Tirar foto numa vistoria pelo app nativo.

---

### 4.3 — Quebrar os arquivos gigantes `[G]` 🟡

`AdminManutencoesLista.tsx` **2920**, `CobrancaDetalhes.tsx` 1804, `AtualizacaoAnuncio.tsx` 1791, `TicketDetalhes.tsx` 1284, `PlanoPerformanceSection.tsx` 1268, `PropostaCompleta.tsx` 1080.

Começar por `CobrancaDetalhes` (tela mais importante do proprietário): extrair cabeçalho/resumo, pagamentos, anexos, chat e ações; lógica para hooks. Meta: nada acima de ~400 linhas.

**Risco.** Médio-alto sem testes. Um PR pequeno por vez, com conferência visual.

---

### 4.4 — Unificar o modelo de manutenção `[M]` 🟡

Manutenção vive em `tickets` (`kind='maintenance'`, com `essential`, `cost_responsible`, `owner_decision`, `charge_draft_*`) **e** em `charges` — `useMaintenances.ts` consulta as duas (`:46`, `:179`, `:281`). Quem lê não sabe qual é a fonte de cada campo, e o Lovable também não.

**Proposta.** Mapear campo a campo qual tabela manda, escrever no `CLAUDE.md`, e só então considerar unificar. Documentar agora; migrar só se o modelo apertar.

---

### 4.5 — Desktop `[M]` 🟡

As telas da equipe (uso diário em desktop) ainda são empilhamento vertical em container centralizado. Layout mestre-detalhe em `xl:` para `/todos-tickets` e `/gerenciar-cobrancas`, filtros persistentes em barra lateral, tabelas mais densas. Mobile fica como está — proprietário é prioridade.

---

# Onda 5 — Lançamento do app

### 5.1 — Decidir o `appId` `[P]` 🟠

Três valores já circularam: `com.rioscarehubb.app` (original, com "bb" que parece erro de digitação), `com.rioshospedagens.proprietarios` (alteração local, hoje no stash) e `app.rios.proprietarios` (no `origin/main`, commit `30c3931`).

**Por que importa.** O `appId` é a identidade do app nas lojas. **Depois da primeira publicação não pode ser alterado** — trocar exige listagem nova, perdendo instalações, avaliações e histórico. Precisa bater com o `package_name` do Firebase, senão o push para.

**Proposta.** Conferir o que está no Firebase (`FIREBASE_ANDROID_SETUP.md`, `android/app/google-services.json`) e nas contas das lojas. Se nada foi publicado, fixar um valor e alinhar os três lugares.

**Validar.** `capacitor.config.ts` == `google-services.json` == `build.gradle`. Push chegando num build de release.

### 5.2 — Teclado virtual nos formulários `[M]` 🟡

**[DÚVIDA]** Não dá para avaliar só pelo código — precisa de aparelho real. Testar `/novo-ticket`, `CleanerInspectionForm` e os chats em Android e iOS: campo em foco atrás do teclado, botão de enviar inacessível. Se confirmar, `@capacitor/keyboard` com `resize: 'body'` + `scrollIntoView` no foco.

---

## Ordem sugerida

1. ~~**Hoje:** 1.1~~ ✅ feito em 2026-09-18.
2. **Próximo:** 1.9 (ler as quatro funções órfãs — podem esconder outro `admin-reset-password`) e 1.3 (invalidar tokens de curadoria, é SQL de uma linha).
3. **Esta semana:** 1.2 (valor da curadoria) e 1.4 etapa 1 (trigger em `profiles`).
4. **Depois:** 1.5 a 1.8, então 2.1 + 2.2 (velocidade que o proprietário sente), então Onda 3.
5. **4.1 destrava** a revisão completa de RLS.

## Como executar sem depender do agente do Lovable

O backend é **Lovable Cloud** — o projeto Supabase pertence ao Lovable e não há como transferi-lo para uma conta própria (Advanced settings só oferece exportar, pausar ou remover). Na prática:

| Precisa de | Caminho |
|---|---|
| RLS, triggers, constraints, correção de dados, auditoria de schema | **SQL direto** via MCP do Lovable (`query_database`) — sem custo de crédito |
| Ler código e métricas de function, logs, secrets, usuários, storage | Painel **Lovable → Mais → Cloud** |
| **Deploy ou delete de edge function** | Só o **agente do Lovable** (consome crédito) |

Ou seja: os itens 1.2 a 1.4, 1.8, 4.1 e 4.3 são executáveis direto. Só o que mexe em deploy de function depende do agente.

## Cinco de maior impacto

1. **1.2** — Curadoria paga por R$ 1,00: o valor do PIX vem do cliente e ninguém confere, em nenhuma das três etapas.
2. **1.3** — `curation-access`: link de e-mail nunca expira e é reutilizável — login permanente na conta do proprietário.
3. **1.4** — Escalação de privilégio: proprietário logado vira admin e lê o financeiro de todos.
4. **1.9** — Quatro funções publicadas sem código no Git. Enquanto existirem, nenhuma auditoria de repositório é completa.
5. **2.1** — 4,4 MB num chunk só (1,22 MB gzip), crescendo 2,4× a cada nove meses. Maior ganho isolado de velocidade.

> Resolvido: **1.1** (`admin-reset-password`, 2026-09-18) e metade do **4.2**.
