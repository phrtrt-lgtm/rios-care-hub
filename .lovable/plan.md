## Visão geral

Transformar o fluxo de curadoria em um funil completo: e-mail bonito e moderno → proprietária paga PIX direto na curadoria → webhook libera acesso ao sistema automaticamente (etapa 04) → e-mails de confirmação saem pra ela e pra equipe. Além disso, planilha exportada com links e reordenação visual do "como funciona".

---

## 1. Novo template de e-mail moderno (notify-curation-ready)

Substituir o HTML atual (centralizado simples) por um layout editorial RIOS:
- Header com gradiente laranja RIOS, logo simbólico e título "Sua curadoria está pronta"
- Card branco arredondado com:
  - Saudação personalizada
  - Bloco "O que você vai encontrar" com 4 mini-cards (Lista curada · Plano de performance · Observações editoriais · Pagamento PIX direto)
  - Resumo da etapa atual ("Etapa 03 de 04")
- CTA principal grande em laranja "Criar minha senha e ver a curadoria"
- Bloco secundário em fundo bege explicando como funciona (você paga, RIOS executa)
- Footer com contato e disclaimer
- Tipografia system-ui/Helvetica, paleta laranja `#e85d3a` + neutros, bordas 12px

Mesmo template em modo teste e real (apenas com banner amarelo no topo quando teste).

## 2. Planilha exportada com link dos itens

Hoje a IA já extrai `link` do produto, mas a planilha gerada (botão "Baixar planilha" em AdminCuradoriaNova) não inclui essa coluna. Adicionar coluna **"Link do produto"** na exportação CSV/XLSX, posicionada após "Preço". Quando o item não tiver link, fica vazio.

## 3. Pagamento PIX da curadoria (top + bottom)

Dois botões verdes idênticos no `PlanoPerformanceSection`:
- Um **acima de tudo** (antes do trigger card, novo bloco hero verde com valor total e CTA "Pagar curadoria com PIX")
- Outro **dentro do dialog**, ao final das observações (após "Como funciona")

Comportamento ao clicar:
- Chama nova edge function `create-curation-pix` (espelhada em `create-booking-pix`, mas para curadoria)
- Usa `MERCADOPAGO_ACCESS_TOKEN` já configurado
- `transaction_amount` = soma de todos os itens da curadoria
- `external_reference` = `curation:<owner_curation_id>`
- `description` = `curadoriaRIOS<unitSlug>`
- Abre dialog com QR Code + botão "Copiar PIX copia e cola" + valor total destacado

Estado de pagamento exibido:
- Pendente: botão verde "Pagar curadoria · R$ X.XXX"
- Pago: badge verde "✓ Curadoria paga · acesso liberado"

## 4. Webhook → libera etapa 04 + dispara e-mails

Adicionar handler novo no `mercadopago-webhook/index.ts` que reconhece `external_reference` começando com `curation:`:

Quando `status === 'approved'`:
1. Marcar `owner_curations.status = 'paid'` e gravar `paid_at`, `mercadopago_payment_id`, `payment_amount_cents` (migration adiciona colunas)
2. Atualizar `profiles.onboarding_stage = 'active'` do owner_id da curadoria → desbloqueia o sistema completo (etapa 04)
3. Inserir `notifications` pra equipe admin ("Curadoria paga por X")
4. Disparar duas chamadas:
   - Nova edge function `notify-curation-paid` que envia 2 e-mails:
     - **Pra equipe RIOS** (lista de `ADMIN_NOTIFY_EMAILS`): "💰 Curadoria paga · X · R$ Y" com detalhes da unidade, valor, link admin
     - **Pra proprietária**: "🎉 Bem-vinda à RIOS · acesso liberado" com layout moderno explicando que a etapa 04 foi finalizada, login direto no portal, próximos passos da operação

## 5. Migration de banco

```sql
ALTER TABLE owner_curations 
  ADD COLUMN IF NOT EXISTS total_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS mercadopago_payment_id text,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 text;
```

Status passa a aceitar `'paid'` além dos atuais.

## 6. Reordenação visual do BemVindo

Mover o bloco "Como funciona" (4 pilares + jornada de etapas) pra ficar **acima de tudo**, antes da seção de curadoria/`PlanoPerformanceSection`. Hoje os pilares ficam após o resumo; passam a ser a primeira coisa que ela vê depois do hero, dando contexto claro antes da curadoria.

## 7. Detalhes técnicos

- `create-curation-pix` segue exatamente o padrão de `create-booking-pix` (auth via JWT do owner, idempotency-key UUID, salva qr_code na tabela)
- O webhook não quebra fluxo existente: novo `if (externalRef?.startsWith('curation:'))` antes dos paths atuais
- `notify-curation-paid` reutiliza Resend já configurado, dois templates HTML inline (proprietária + equipe)
- Botão PIX só aparece quando `total_amount_cents > 0` (calculado a partir das categorias da curadoria)
- Após pagamento, polling de 5s no `PlanoPerformanceSection` checa status até aparecer "pago"

## Arquivos afetados

**Edita:**
- `supabase/functions/notify-curation-ready/index.ts` (template novo)
- `supabase/functions/mercadopago-webhook/index.ts` (handler curation)
- `src/pages/AdminCuradoriaNova.tsx` (planilha c/ links + persistir total_amount_cents)
- `src/components/bemvindo/PlanoPerformanceSection.tsx` (botões PIX top/bottom + dialog QR)
- `src/pages/BemVindo.tsx` (reordenação)

**Cria:**
- `supabase/functions/create-curation-pix/index.ts`
- `supabase/functions/notify-curation-paid/index.ts`
- Migration adicionando colunas em `owner_curations`

## Fora do escopo (pra confirmar se quer agora)

- Política de reembolso/cancelamento PIX
- Tela admin pra reverter "paid" manualmente
- Recibo MercadoPago anexado no e-mail (só link)
