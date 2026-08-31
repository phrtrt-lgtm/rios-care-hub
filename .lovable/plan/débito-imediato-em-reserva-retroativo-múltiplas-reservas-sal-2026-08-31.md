
# Débito imediato em reserva (retroativo) + múltiplas reservas + saldo credor

Novo fluxo paralelo ao "agendar débito em reserva" atual. Serve para quando a retenção **já aconteceu** em uma ou mais reservas passadas: você registra tudo de uma vez, as cobranças quitam na hora, o proprietário recebe o e-mail (mesmo template atual) informando o débito já efetuado, e qualquer excedente vira **saldo credor** para abater em cobranças futuras ou devolver.

## Fluxo para o admin

Na tela de débito em reserva, novo botão **"Débito imediato (retroativo)"** ao lado do fluxo atual.

Passos:
1. **Seleciona as cobranças** em aberto do proprietário (uma ou várias).
2. **Adiciona uma lista de reservas** já usadas para cobrir o débito. Para cada reserva:
   - Data do check-in (padrão: hoje)
   - Valor bruto da reserva
   - `%` de comissão aplicada (base + extra, como no fluxo atual)
   - Valor retido calculado automaticamente
   - Botão "+ Adicionar outra reserva" para empilhar quantas quiser
3. **Preview** mostra:
   - Total retido somando todas as reservas
   - Total devido somando as cobranças
   - Distribuição das retenções pelas cobranças em ordem
   - Sobra destacada como saldo credor (se houver)
4. **Confirmar** → tudo acontece de uma vez:
   - Cobranças ficam `debited`, `debited_at = agora`
   - `reserve_reservations` recebe a lista completa (já existe como jsonb)
   - Excedente cria registro em `owner_credits`
   - E-mail e notificação in-app disparados

## Saldo credor do proprietário

- Se soma das retenções > soma das cobranças, o excedente vira crédito aberto.
- Card visível para admin (tela de débito) e proprietário (Minhas Cobranças).
- Ao criar nova cobrança para o proprietário, admin pode marcar "Abater do saldo credor (R$ X disponível)".
- Admin também pode marcar "Devolvido" (com data + observação), encerrando o saldo.

## Visão do proprietário

- Cobrança quitada por débito retroativo mostra bloco atual de reservas + selo "Débito efetuado em dd/mm".
- Tabela lista todas as reservas usadas (mesmo formato que já usamos hoje em `reservationsTableHtml`).
- Se gerou crédito: banner no topo de Minhas Cobranças com valor e histórico.

## Escopo técnico

### 1. Banco (migração)

**Nova tabela `owner_credits`**
- `owner_id`, `origin_type` ('reserve_retention'), `origin_note` (ex.: "Reservas de dd/mm, dd/mm"), `origin_reservations` jsonb (snapshot), `initial_amount_cents`, `remaining_amount_cents`, `status` ('open' | 'consumed' | 'refunded'), `refunded_at`, `refund_note`.
- RLS: proprietário lê o próprio; admin lê/escreve tudo; service_role total.

**Nova tabela `owner_credit_applications`**
- `credit_id`, `charge_id`, `amount_applied_cents`, `applied_at`, `applied_by`.
- Auditoria: "R$ 200 do crédito X foi abatido da cobrança Y".

**Campos novos em `charges`**
- `retroactive_debit` boolean — diferencia origem do débito na UI e no e-mail.
- `credit_applied_cents` int — quanto de crédito foi consumido nesta cobrança.

Grants + RLS + `updated_at` triggers no padrão do projeto. Sem CHECK dependente de tempo.

### 2. Edge function `debit-reserve-now`

Nova função espelhando `debit-reserve`, com estas diferenças:
- Aceita array de reservas no payload (mesma estrutura de `ReservationItem`).
- Marca cobranças como `debited` (não `aguardando_reserva`) com `debited_at = now()`.
- Preenche `reserve_reservations` com a lista completa, `reserve_debit_date` = check-in da primeira reserva.
- Distribui o total retido nas cobranças em ordem selecionada; excedente cria `owner_credits`.
- Mantém `owner_payment_scores` com `reason='reserve_debit'` (-30), igual ao fluxo atual.
- E-mail: reutiliza o template `reserve_debit_notification` com dois blocos condicionais novos:
  - "Débito já efetuado" (quando retroativo) — troca o texto de agendamento pelo de já executado.
  - "Saldo credor gerado: R$ X" — só aparece se sobrou.
- A tabela de reservas do e-mail (`reservationsTableHtml`) já suporta múltiplas linhas — reutilizada como está.
- Notificação in-app tipo `charge` apontando para `/minhas-cobrancas`.

### 3. Frontend

**`DebitoReservaCalculator` (tela admin)**
- Toggle no topo: "Agendar em reserva futura" (atual) | "Débito imediato retroativo" (novo).
- Modo retroativo: lista dinâmica de reservas (add/remove), cálculo em tempo real, preview de distribuição e destaque de saldo credor.
- Ação chama `debit-reserve-now`.

**`OpenChargesTable` / `PendingReserveDebitsBoard`**
- Card "Saldo credor do proprietário" com "Abater em nova cobrança" e "Registrar devolução".

**`MinhasCobrancas` (proprietário)**
- Banner de saldo credor quando `remaining_amount_cents > 0`.
- Cobrança debitada retroativamente mostra selo + tabela de reservas.

**`NovaCobranca` (admin)**
- Se proprietário tem crédito aberto: checkbox "Abater R$ X do saldo credor". Ao salvar, cria `owner_credit_applications`, ajusta `credit_applied_cents` e, se cobrir tudo, marca a cobrança como paga.

### 4. E-mail

Mantém o template atual `reserve_debit_notification` (mesmo layout gradiente roxo, mesmo header RIOS, mesma tabela de reservas). Adiciona apenas dois blocos condicionais:
- `{{#if retroactive}}` — troca "agendado" por "já efetuado em dd/mm".
- `{{#if credit_amount}}` — bloco verde com "Saldo credor gerado: R$ X" e explicação de que será abatido/devolvido.

Nenhum novo layout de e-mail, nenhuma estética nova — só variáveis a mais dentro do template existente.

## Pontos a confirmar antes de implementar

1. **Score:** mantenho o -30 padrão também no débito retroativo? (fluxo atual aplica isso; me diga se retroativo deve pular a penalidade)
2. **Ordem de distribuição:** distribuo pelas cobranças na ordem em que você selecionar (permitindo reordenar). OK?
3. **Devolução do saldo credor:** apenas marcação manual "devolvido" com data + observação, sem integração de pagamento. OK?
