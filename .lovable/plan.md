
# Módulo de Contratos — Fluxo Completo

## Visão geral
Hoje não existe módulo de contratos no portal. Será criado do zero, seguindo o fluxo:

```text
RIOS cria pré-contrato → Proprietário preenche dados → RIOS revisa →
Aprovação → Geração HTML/PDF final → (futuro) Assinatura gov.br
```

O PDF usará como template padrão o modelo já criado pela Lovable (anexo), recriado em HTML/CSS no mesmo estilo (cabeçalho "RIOS GESTÃO...", numeração de cláusulas em blocos, marcações de destaque, rodapé com data e foro).

---

## 1. Banco de dados (Lovable Cloud)

### Tabelas novas
- **contract_templates**: `id, name, version, content_html, content_md, variables_schema_json, is_default, created_by, archived_at, timestamps`. Apenas admin gerencia. RLS: admin tudo; demais leitura quando `is_default`.
- **contracts**: `id, owner_id, property_id, template_id, status (enum: draft_rios, awaiting_owner, owner_filling, submitted, correction_requested, approved, generated, signed, cancelled), commission_percent, term_months, start_date, maintenance_limit_cents, specific_terms, created_by, generated_pdf_path, generated_html_snapshot, frozen_data_json, current_submission_id, timestamps`.
- **contract_owner_submissions**: conforme spec — `submitted_data_json (jsonb), status (draft|submitted|approved|correction_requested|rejected), correction_message, submitted_at, approved_at, approved_by, timestamps`. Um por contrato (current) + histórico.
- **contract_submission_attachments**: anexos do formulário (`kind: documento_pessoal | comprovante_propriedade | comprovante_endereco | representante`), apontando para bucket privado.
- **contract_events**: timeline (`contract_id, event_type, actor_id, actor_role, payload_json, created_at`) para auditoria.

### Storage
- Novo bucket privado `contract-attachments` (docs do proprietário) e `contracts` (PDFs gerados).

### RLS
- Proprietário acessa apenas contratos/submissões onde `owner_id = auth.uid()`.
- Admin (via `has_role`) acessa tudo.
- `frozen_data_json` é congelado na geração — alterações posteriores no profile não afetam.

---

## 2. Backend (Edge Functions)

- **generate-contract-pdf**: monta HTML final a partir de `template.content_html` + `frozen_data_json` + dados comerciais, gera PDF (puppeteer/pdf-lib server-side ou render server-side via HTML→PDF lib disponível no Deno; uso de `npm:@react-pdf/renderer` ou `npm:html-pdf-node` alternativa). Grava no bucket `contracts`, atualiza `generated_pdf_path` e cria evento.
- **send-contract-notification**: usa Resend (já configurado) para notificar proprietário em cada transição (convite, correção solicitada, aprovação, contrato pronto).
- Trigger DB: ao mudar status para `awaiting_owner`, criar `notification` para owner + invocar email.

---

## 3. Frontend

### Admin
- Nova rota `/admin/contratos` — lista de contratos com filtros (status, proprietário, imóvel).
- `/admin/contratos/novo` — wizard: seleciona proprietário, imóvel, template, define comissão, vigência, data início, limite manutenção, condições específicas → cria pré-contrato (`status=awaiting_owner`).
- `/admin/contratos/:id` — abas: **Resumo**, **Dados recebidos** (visualiza submissão, botões Aprovar / Solicitar correção / Editar com justificativa), **Documentos anexos**, **Timeline**, **PDF gerado**.
- Botão "Gerar contrato final" habilita após `approved`.

### Proprietário
- Card destacado no `/painel`: "Preencha seus dados para emissão do contrato" quando houver contrato em `awaiting_owner` ou `correction_requested`.
- Rota `/contratos` — lista; `/contratos/:id` — formulário guiado.
- Wizard mobile-first em 4 etapas com barra de progresso:
  1. **Dados pessoais/empresariais** (PF/PJ condicional, validação CPF/CNPJ, e-mail, endereço com lookup CEP).
  2. **Dados do imóvel** (pré-preenche com `properties`, permite editar).
  3. **Dados bancários (opcional)** + **anexos**.
  4. **Confirmações** (4 checkboxes obrigatórios) + **Revisão**.
- Auto-save como rascunho (debounce 1.5s) gravando `contract_owner_submissions` com `status=draft`.
- Aviso fixo: "Esses dados serão usados para emissão do contrato. Revise com atenção."
- Após envio: tela bloqueada com status atual + botão "Baixar contrato" quando disponível.

### Componentes reutilizados
- `ReportStepIndicator` (já existe) para a barra de progresso.
- shadcn `Form`, `Dialog`, `Card`, `Checkbox`, `Input`, `Textarea`, tokens semânticos (sem cores raw).
- `EmptyState` e `SectionSkeleton` para estados vazios/loading.

---

## 4. Template do contrato (design)

Template HTML/CSS recriando o anexo:
- Cabeçalho: faixa com "RIOS GESTÃO DE IMÓVEIS POR TEMPORADA", linha fina divisória, metadados (📄 Documento de Função / 📅 data).
- Título principal grande, serif sutil ou sans display.
- Cláusulas numeradas em blocos `##` com badge circular do número.
- Marcações `<mark>` para cláusulas destacadas (ex. 5.7).
- Rodapé com paginação, foro Cabo Frio/RJ e bloco de assinaturas.
- Texto integral do modelo anexo armazenado em `contract_templates` (versão 1, `is_default=true`) — variáveis com placeholders `{{owner.name}}`, `{{property.address}}`, `{{commission_percent}}`, etc.

Preview do template renderizado tanto no admin (antes de gerar) quanto no proprietário (após geração).

---

## 5. Eventos auditados (contract_events)
`owner_started_filling`, `owner_saved_draft`, `owner_submitted`, `rios_requested_correction`, `owner_resubmitted`, `rios_approved`, `contract_generated`, `contract_pdf_downloaded`, `contract_cancelled`.

---

## 6. Segurança
- RLS estrita (proprietário só vê o seu); `has_role` para admin.
- Validação Zod no frontend e na edge function.
- `frozen_data_json` salvo na geração — imutável depois.
- Nova versão a cada regeneração (incrementa `version` no `contracts` ou cria registro filho `contract_versions`).
- Anexos em bucket privado com signed URLs.

---

## 7. Entregáveis desta iteração
1. Migration com tabelas, enums, RLS, GRANTs, triggers, bucket.
2. Seed do `contract_templates` v1 com texto integral do anexo.
3. Edge functions `generate-contract-pdf` e `send-contract-notification`.
4. Páginas admin: lista, novo, detalhe (com abas).
5. Páginas proprietário: card no painel, wizard de preenchimento, tela de revisão.
6. Componentes: `ContractStatusBadge`, `ContractTimeline`, `OwnerSubmissionForm`, `ContractTemplatePreview`.
7. Atualização no menu lateral (admin + owner).

### Fora do escopo desta iteração
- Integração com gov.br (mockado: botão "Enviar para assinatura" prepara payload e marca status `awaiting_signature`).
- Editor visual do template (apenas templates pré-cadastrados via SQL nesta fase).

---

## Perguntas rápidas antes de executar
1. **Limite de manutenção**: prefere em R$ (centavos) único ou faixa (valor + critério)?
2. **Vigência**: campo livre em meses ou apenas opções fixas (12, 24, 36)?
3. **Assinatura gov.br**: posso mockar nesta entrega e deixar a integração real para próxima iteração?
4. **Geração de PDF**: posso usar render server-side com HTML→PDF (Puppeteer não roda em Edge Function Deno; usaria `pdf-lib` montando o documento, ou serviço externo como `api2pdf`/`browserless`). Você prefere (a) usar `@react-pdf/renderer` no edge (b) integrar serviço externo (c) gerar client-side via `html2pdf.js` e fazer upload?
