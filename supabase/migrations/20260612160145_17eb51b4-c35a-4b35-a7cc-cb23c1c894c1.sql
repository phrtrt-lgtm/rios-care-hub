
CREATE TYPE public.contract_status AS ENUM (
  'draft_rios','awaiting_owner','owner_filling','submitted',
  'correction_requested','approved','generated','signed','cancelled'
);
CREATE TYPE public.contract_submission_status AS ENUM (
  'draft','submitted','approved','correction_requested','rejected'
);

CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content_md TEXT NOT NULL,
  variables_schema JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage contract templates" ON public.contract_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated read templates" ON public.contract_templates
  FOR SELECT TO authenticated USING (archived_at IS NULL);
CREATE TRIGGER trg_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES public.contract_templates(id),
  status public.contract_status NOT NULL DEFAULT 'draft_rios',
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 22,
  term_months INTEGER NOT NULL DEFAULT 24,
  start_date DATE,
  maintenance_limit_cents INTEGER NOT NULL DEFAULT 300000,
  specific_terms TEXT,
  current_submission_id UUID,
  frozen_data JSONB,
  generated_html TEXT,
  generated_pdf_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  signed_at TIMESTAMPTZ,
  signature_provider TEXT,
  created_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_owner ON public.contracts(owner_id);
CREATE INDEX idx_contracts_property ON public.contracts(property_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin all contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Team read contracts" ON public.contracts
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Owner read own contracts" ON public.contracts
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contract_owner_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  submitted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.contract_submission_status NOT NULL DEFAULT 'draft',
  correction_message TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_csub_contract ON public.contract_owner_submissions(contract_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_owner_submissions TO authenticated;
GRANT ALL ON public.contract_owner_submissions TO service_role;
ALTER TABLE public.contract_owner_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin all submissions" ON public.contract_owner_submissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Team read submissions" ON public.contract_owner_submissions
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Owner manage own submissions" ON public.contract_owner_submissions
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_csub_updated_at
  BEFORE UPDATE ON public.contract_owner_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contract_submission_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.contract_owner_submissions(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_submission_attachments TO authenticated;
GRANT ALL ON public.contract_submission_attachments TO service_role;
ALTER TABLE public.contract_submission_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin all csub attach" ON public.contract_submission_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Team read csub attach" ON public.contract_submission_attachments
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Owner manage own csub attach" ON public.contract_submission_attachments
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cevent_contract ON public.contract_events(contract_id, created_at);
GRANT SELECT, INSERT ON public.contract_events TO authenticated;
GRANT ALL ON public.contract_events TO service_role;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/team read events" ON public.contract_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_team_member(auth.uid()));
CREATE POLICY "Owner read own events" ON public.contract_events
  FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND c.owner_id = auth.uid()));
CREATE POLICY "Authenticated insert events" ON public.contract_events
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_team_member(auth.uid())
    OR EXISTS(SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND c.owner_id = auth.uid())
  );

INSERT INTO public.contract_templates (name, version, is_default, content_md, variables_schema) VALUES (
'Contrato RIOS — Gestão de Imóvel por Temporada', 1, true,
$tpl$# Contrato de Prestação de Serviços de Administração e Gestão de Imóvel para Locação por Temporada

**CONTRATANTE/PROPRIETÁRIO:** {{owner.name}}, inscrito no {{owner.doc_label}} sob nº {{owner.doc}}, residente/sediado em {{owner.address}}, e-mail {{owner.email}}, telefone {{owner.phone}}, doravante denominado simplesmente PROPRIETÁRIO.

**CONTRATADA/GESTORA:** {{rios.name}}, inscrita no CNPJ sob nº {{rios.cnpj}}, com sede em {{rios.address}}, e-mail {{rios.email}}, telefone {{rios.phone}}, doravante denominada simplesmente RIOS.

*Têm entre si justo e contratado o presente Contrato de Prestação de Serviços de Administração e Gestão de Imóvel para Locação por Temporada, mediante as cláusulas e condições abaixo.*

## 01 Dados do Imóvel
1.1. O presente contrato tem por objeto a administração e gestão operacional do seguinte imóvel:
- Endereço completo: {{property.address}}
- Unidade/apartamento/casa: {{property.unit}}
- Condomínio: {{property.condominium}}
- Cidade/UF: {{property.city_uf}}
- Capacidade máxima de hóspedes: {{property.max_guests}}
- Vagas de garagem: {{property.parking_spots}}

1.2. O PROPRIETÁRIO declara ser legítimo proprietário, possuidor, representante autorizado ou responsável legal pelo imóvel, possuindo poderes para contratar a RIOS e disponibilizar o imóvel para locação por temporada.

1.3. O PROPRIETÁRIO declara que o imóvel está regular, apto e autorizado para uso em locação por temporada, assumindo integral responsabilidade por qualquer restrição documental, condominial, legal, familiar, societária, possessória ou de terceiros que impeça ou limite sua exploração comercial.

## 02 Vigência
2.1. O presente contrato terá vigência de {{contract.term_months}} meses, com início em {{contract.start_date}}.

2.2. Após o término da vigência, o contrato poderá ser renovado por acordo entre as partes, por escrito, inclusive por aceite eletrônico, e-mail, assinatura digital ou registro no Portal RIOS.

## 03 Objeto do Contrato
3.1. A RIOS prestará serviços de administração, gestão operacional e gestão comercial do imóvel para locação por temporada.

3.2. Os serviços poderão incluir, conforme necessidade operacional e estratégia da RIOS: criação, otimização e gestão de anúncios; produção e organização de fotos, vídeos e materiais; precificação, calendário e regras de estadia; gestão de Airbnb, Booking, Expedia e canais diretos; comunicação com hóspedes antes, durante e após estadia; check-in, check-out, limpeza, lavanderia e manutenção; cobrança de danos, reembolsos e multas; reputação, avaliações e prevenção de prejuízos; acionamento e coordenação de prestadores; registro operacional via Portal RIOS e sistemas.

3.3. A RIOS atuará como gestora operacional e comercial, não sendo imobiliária tradicional, seguradora, garantidora patrimonial, fiadora de hóspedes ou responsável automática por danos, furtos, sinistros, vícios, falhas estruturais ou atos de terceiros.

## 04 Exclusividade Operacional
4.1. Durante a vigência, o imóvel será operado com exclusividade pela RIOS para fins de locação por temporada.

4.3. Fica expressamente vedado ao PROPRIETÁRIO realizar, aceitar, negociar, prometer, confirmar, administrar ou receber reservas diretamente, por qualquer canal, meio ou intermediário.

4.6. O descumprimento desta cláusula configura interferência operacional grave e autoriza a RIOS a aplicar multa, cobrar prejuízos, pausar anúncios, bloquear calendário, suspender operação ou rescindir o contrato por justa causa.

## 05 Uso Pessoal do Imóvel pelo Proprietário
5.1. O PROPRIETÁRIO poderá solicitar bloqueio para uso pessoal próprio, desde que a solicitação seja feita previamente à RIOS e aprovada pela gestora.

5.7. Quando o PROPRIETÁRIO solicitar bloqueio para uso pessoal e desejar encontrar o imóvel limpo, organizado e preparado em padrão de hospedagem, deverá pagar a taxa de limpeza vigente do imóvel.

## 06 Poderes Operacionais da RIOS
6.1. O PROPRIETÁRIO autoriza a RIOS a praticar todos os atos necessários à administração e gestão operacional do imóvel para locação por temporada.

## 07 Plataformas e Canais de Venda
7.1. A RIOS poderá divulgar e operar o imóvel em plataformas como Airbnb, Booking, Expedia e outros canais compatíveis com a estratégia comercial.

## 08 Precificação, Calendário e Estratégia Comercial
8.1. A RIOS definirá preços, descontos, regras de estadia, estadia mínima, disponibilidade, bloqueios comerciais, promoções e ajustes de calendário.

## 09 Comissão da RIOS
**{{contract.commission_percent}}%** sobre o valor das diárias.

9.1. A comissão da RIOS será de {{contract.commission_percent}}% sobre o valor das diárias.

9.3. A comissão não incidirá sobre taxa de limpeza, taxa extra de lavanderia, caução, reembolso de manutenção, compras, multas, encargos, repasses de terceiros ou valores meramente operacionais.

9.5. Condição comercial específica, se houver: {{contract.specific_terms}}

## 10 Limpeza, Faxineira Designada, Lavanderia, Enxoval e Valores Operacionais
10.1. A taxa de limpeza/turnover é valor operacional vinculado à preparação do imóvel para estadias, sendo gerenciada pela RIOS em nome do PROPRIETÁRIO.

10.4. Para padronização da operação, a RIOS designará uma faxineira principal para cada imóvel.

10.6. A limpeza de check-out será realizada após a saída do hóspede, com prazo máximo de até 96 horas após o check-out.

## 11 Recebimentos, Repasses e Pagamentos por Canal
11.4. No caso de reservas do Booking em que o valor seja recebido pelo PROPRIETÁRIO, a comissão da RIOS deverá ser paga exclusivamente pelo Portal RIOS, via PIX.

11.7. O prazo para pagamento de comissão, manutenção, multa ou qualquer valor devido à RIOS será de até 7 dias corridos contados da emissão da cobrança no Portal RIOS.

## 12 Inadimplência, Compensação, Retenção e Proteção do Proprietário
12.1. O não pagamento de qualquer valor devido à RIOS autoriza a compensação do débito em qualquer crédito presente ou futuro relacionado ao imóvel ou ao PROPRIETÁRIO.

## 13 Portal RIOS e Comunicação Oficial
13.2. O Portal RIOS será considerado canal oficial para solicitações, bloqueios, financeiro, cobranças, chamados, registros operacionais, manutenções, vistorias e comunicações relevantes.

## 14 Manutenção, Autonomia Operacional, Bom Senso e Aporte da RIOS
14.1. A manutenção será conduzida pela RIOS com foco em preservar a estadia, proteger a reputação, evitar cancelamentos.

14.6. Em caso de manutenção essencial ou urgente, a RIOS poderá contratar prestadores, comprar itens, executar reparos, deslocar equipe e adotar providências imediatas, sem aprovação prévia do PROPRIETÁRIO, até o limite de R$ {{contract.maintenance_limit_brl}} por ocorrência.

14.15. Os custos de manutenção, compras, deslocamentos, mão de obra, peças, materiais, taxas emergenciais, serviços de terceiros e reposições serão de responsabilidade do PROPRIETÁRIO.

## 15 Vistorias, Registros e Condição Geral do Imóvel
15.1. A RIOS poderá realizar vistorias, registros fotográficos, vídeos, checklists, relatórios e observações operacionais.

## 16 Obrigações do Proprietário
16.2. São obrigações do PROPRIETÁRIO: permitir manutenções e reparos; custear manutenções, reposições, compras e serviços necessários; manter regularidade com condomínio, IPTU, taxas e contas de consumo; informar vícios, defeitos e restrições; respeitar a exclusividade operacional da RIOS; pagar comissões, manutenções, compras, cobranças, multas e valores devidos.

## 17 Condomínio, Portaria e Terceiros
17.1. O PROPRIETÁRIO declara que o imóvel está apto à locação por temporada conforme convenção, regimento interno e demais regras condominiais.

## 18 Interferência do Proprietário
18.3. Ocorrendo interferência indevida com risco ou impacto operacional, aplica-se multa de R$ 400,00 por ocorrência, sem prejuízo do reembolso integral de prejuízos.

## 19 Cancelamento, Pausa de Anúncio e Risco Operacional
19.1. A RIOS poderá pausar anúncios, bloquear datas, suspender vendas, interromper check-ins, solicitar cancelamentos ou cancelar reservas quando houver risco operacional relevante.

## 20 Danos, Proteções de Plataforma, Seguros
20.1. A RIOS não é seguradora, garantidora, fiadora, custodiante patrimonial ou responsável automática por danos, furtos, quebras, sinistros, vícios do imóvel.

## 21 Fotos, Vídeos, Anúncios e Propriedade Intelectual
21.2. Todas as fotos, vídeos, edições, textos, descrições, identidade comercial, anúncios e materiais produzidos pela RIOS constituem ativo intelectual e operacional da RIOS.

21.6. O uso indevido dos materiais da RIOS sujeitará o PROPRIETÁRIO à multa de R$ 3.000,00 por ocorrência ou por anúncio/plataforma em que o material for utilizado.

## 22 Chaves, Tags, Controles e Acesso ao Imóvel
22.1. O PROPRIETÁRIO deverá fornecer à RIOS chaves, tags, controles, senhas, cartões, dispositivos e meios de acesso necessários à operação.

## 23 LGPD, Dados, Automações e IA
23.1. As partes autorizam o tratamento de dados pessoais necessários à execução deste contrato.

## 24 Limitação de Responsabilidade da RIOS
24.1. A RIOS responderá apenas por falhas diretamente atribuíveis à sua atuação.

## 25 Ausência de SLA Rígido
25.2. A RIOS atuará com diligência, boa-fé, organização operacional e priorização conforme criticidade, sem assumir obrigação de resultado.

## 26 Rescisão
26.1. Aviso prévio: 90 dias por qualquer das partes.

26.4. A RIOS poderá rescindir por justa causa, sem aviso prévio, em hipóteses de inadimplência, reserva fora da operação, interferência relevante, uso indevido de materiais, descumprimento condominial, ausência de condições mínimas e conduta inadequada.

## 27 Transição e Encerramento
27.1. Encerrado o contrato, o PROPRIETÁRIO deverá cooperar para transição organizada.

## 28 Multas, Perdas e Danos
28.1. As multas não substituem o dever de reparar perdas e danos.

## 29 Assinatura Eletrônica
29.1. Este contrato poderá ser assinado eletronicamente, inclusive via gov.br, certificado digital ou aceite registrado no Portal RIOS.

## 30 Disposições Gerais
30.4. Alterações somente terão validade se realizadas por escrito.

## 31 Foro
31.1. Fica eleito o foro da comarca de Cabo Frio/RJ, com renúncia a qualquer outro, para dirimir eventuais controvérsias decorrentes deste contrato.

*E, por estarem justas e contratadas, as partes assinam o presente instrumento.*

**{{contract.location}}, {{contract.date}}.**
$tpl$,
'{"placeholders":["owner.name","owner.doc","owner.doc_label","owner.address","owner.email","owner.phone","rios.name","rios.cnpj","rios.address","rios.email","rios.phone","property.address","property.unit","property.condominium","property.city_uf","property.max_guests","property.parking_spots","contract.term_months","contract.start_date","contract.commission_percent","contract.specific_terms","contract.maintenance_limit_brl","contract.location","contract.date"]}'::jsonb
);
