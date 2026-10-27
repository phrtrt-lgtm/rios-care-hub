import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { assinarAnexos, enviarAnexos, novoId, removerAnexos } from "@/lib/anexosListas";
import { ETAPAS_ABERTAS, ETAPAS_FINAIS, type EtapaViabilizacao } from "@/lib/viabilizacaoMeta";
import { salvarCampoManutencao, type ManutencaoDaLista, type ResultadoCampo } from "@/lib/manutencaoLista";
import type { DonoWhatsapp } from "@/components/maintenance/WhatsappAcaoLinha";
import type { ListStatus, TicketStatus } from "@/components/maintenance/listaTipos";

/**
 * Viabilização de imóveis novos (tabela `viabilizacoes`, página /novos-imoveis).
 *
 * O registro guarda o imóvel, o proprietário e a etapa. Os itens "o que
 * fazer" são tickets de manutenção do imóvel, os mesmos da lista de
 * manutenções: a página lê e grava neles pelas funções de
 * `src/lib/manutencaoLista.ts`, para as duas telas serem uma coisa só.
 */

// A tabela é de 2026-10-27 e o types.ts (gerado pelo Lovable) ainda não a
// conhece: até ele ser regenerado, ela passa pelo cliente sem tipos.
const clienteSemTipos = supabase as unknown as SupabaseClient;
export const tabelaViabilizacoes = () => clienteSemTipos.from("viabilizacoes");

export const CHAVE_VIABILIZACOES = "viabilizacoes";
const CHAVE_LISTA_MANUTENCOES = "maintenance-list-view";
const CHAVE_COBRANCAS_LISTA = "pending-charges-list";

export interface ContaProprietario {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  role: string;
  notificar_whatsapp: boolean;
}

export interface ImovelViabilizacao {
  id: string;
  name: string;
  address: string | null;
  owner_id: string;
  owner: ContaProprietario | null;
}

export interface Viabilizacao {
  id: string;
  property_id: string | null;
  nome: string;
  endereco: string | null;
  proprietario_nome: string | null;
  proprietario_telefone: string | null;
  proprietario_email: string | null;
  etapa: EtapaViabilizacao;
  visita_em: string | null;
  estreia_prevista: string | null;
  observacoes: string | null;
  /** Fotos e vídeos da visita (caminhos no bucket) e as URLs assinadas na mesma ordem. */
  anexos: string[];
  anexosUrls: (string | null)[];
  autor_id: string | null;
  autor_nome: string | null;
  concluida_em: string | null;
  concluida_por_nome: string | null;
  created_at: string;
  updated_at: string;
  /** Nulo enquanto o proprietário não tem conta (o imóvel ainda não existe no portal). */
  imovel: ImovelViabilizacao | null;
}

const CAMPOS =
  "id, property_id, nome, endereco, proprietario_nome, proprietario_telefone, proprietario_email, etapa, visita_em, " +
  "estreia_prevista, observacoes, anexos, autor_id, autor_nome, concluida_em, concluida_por_nome, created_at, updated_at, " +
  "imovel:properties(id, name, address, owner_id, owner:profiles!properties_owner_id_fkey(id, name, phone, email, role, notificar_whatsapp))";

export type VisaoViabilizacoes = "abertas" | "concluidas";
const LIMITE_CONCLUIDAS = 60;

/** Nome e endereço mostrados: o imóvel do portal manda quando existe. */
export function nomeViabilizacao(v: Viabilizacao): string {
  return v.imovel?.name ?? v.nome;
}
export function enderecoViabilizacao(v: Viabilizacao): string | null {
  return v.imovel?.address ?? v.endereco;
}

export function useViabilizacoes(visao: VisaoViabilizacoes, ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "lista", visao],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async (): Promise<Viabilizacao[]> => {
      let consulta = tabelaViabilizacoes().select(CAMPOS);
      consulta =
        visao === "abertas"
          ? consulta.in("etapa", ETAPAS_ABERTAS).order("created_at", { ascending: true })
          : consulta.in("etapa", ETAPAS_FINAIS).order("concluida_em", { ascending: false }).limit(LIMITE_CONCLUIDAS);
      const { data, error } = await consulta;
      if (error) throw error;
      const linhas = (data ?? []) as unknown as Omit<Viabilizacao, "anexosUrls">[];
      const urls = await assinarAnexos(linhas.flatMap((l) => l.anexos ?? []));
      return linhas.map((l) => {
        const anexos = l.anexos ?? [];
        return { ...l, anexos, anexosUrls: anexos.map((c) => urls.get(c) ?? null) };
      });
    },
  });
}

export interface ImovelEmViabilizacao {
  id: string;
  nome: string;
  etapa: EtapaViabilizacao;
}

/**
 * Imóveis com viabilização aberta, por property_id. É o que define o quadro
 * "Novos imóveis" da lista de manutenções: manutenção de imóvel que está
 * aqui vai para esse quadro, em vez de Em progresso / Aguardando envio.
 */
export function useImoveisEmViabilizacao(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "imoveis-abertos"],
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ImovelEmViabilizacao>> => {
      const { data, error } = await tabelaViabilizacoes()
        .select("id, nome, etapa, property_id")
        .in("etapa", ETAPAS_ABERTAS)
        .not("property_id", "is", null);
      if (error) throw error;
      const mapa = new Map<string, ImovelEmViabilizacao>();
      for (const l of (data ?? []) as { id: string; nome: string; etapa: EtapaViabilizacao; property_id: string }[]) {
        mapa.set(l.property_id, { id: l.id, nome: l.nome, etapa: l.etapa });
      }
      return mapa;
    },
  });
}

/** Contagem do lembrete do painel: viabilizações em andamento. */
export function useContagemViabilizacoes(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "contagem"],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await tabelaViabilizacoes()
        .select("id", { count: "exact", head: true })
        .in("etapa", ETAPAS_ABERTAS);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Itens (tickets de manutenção do imóvel)                                   */
/* ------------------------------------------------------------------------ */

export interface CobrancaDoItem {
  id: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  created_at: string;
}

export interface ItemViabilizacao extends ManutencaoDaLista {
  status: TicketStatus;
  created_at: string;
  property: { id: string; name: string } | null;
  owner: DonoWhatsapp | null;
  cost_responsible: string | null;
  amount_cents: number | null;
  management_contribution_cents: number | null;
  service_type: string | null;
  attachments_count: number;
  on_hold: boolean;
  ticket_type: string;
  kind: string | null;
  list_status: ListStatus;
  /** Última cobrança de verdade do item (nem rascunho nem arquivada); nula = ainda não enviada. */
  cobranca: CobrancaDoItem | null;
}

/** Cobrança do imóvel sem manutenção de origem (lançada direto em "Nova cobrança"). */
export interface CobrancaAvulsa {
  id: string;
  property_id: string;
  title: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  created_at: string;
}

export interface ItensPorImovel {
  itens: Map<string, ItemViabilizacao[]>;
  avulsas: Map<string, CobrancaAvulsa[]>;
}

interface LinhaCobranca {
  id: string;
  ticket_id: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  service_type: string | null;
  status: string;
  created_at: string;
  archived_at: string | null;
  paid_at: string | null;
  due_date: string | null;
}

/**
 * Manutenções dos imóveis em viabilização, agrupadas por imóvel, com a mesma
 * leitura de valor da lista (cobrança mais recente, senão o rascunho do
 * ticket). Aqui entram também as concluídas já cobradas, para o cartão
 * mostrar "enviada" e "paga".
 */
export function useItensViabilizacao(propertyIds: string[], ativo = true) {
  const ids = [...new Set(propertyIds)].sort();
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "itens", ids],
    enabled: ativo && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ItensPorImovel> => {
      const [tickets, avulsas] = await Promise.all([
        supabase
          .from("tickets")
          .select(
            `
            id, subject, status, created_at, cost_responsible, on_hold, ticket_type, kind,
            charge_draft_amount_cents, charge_draft_management_contribution_cents, charge_draft_category,
            ticket_attachments(count),
            charges(id, ticket_id, amount_cents, management_contribution_cents, service_type, status, created_at, archived_at, paid_at, due_date),
            property:properties(id, name),
            owner:profiles!tickets_owner_id_fkey(id, name, notificar_whatsapp, phone)
          `,
          )
          .in("property_id", ids)
          .or("ticket_type.eq.manutencao,kind.eq.maintenance")
          .is("archived_at", null)
          .neq("status", "cancelado")
          .order("created_at", { ascending: true }),
        supabase
          .from("charges")
          .select("id, property_id, title, status, due_date, paid_at, amount_cents, management_contribution_cents, created_at")
          .in("property_id", ids)
          .is("ticket_id", null)
          .is("archived_at", null)
          .neq("status", "draft")
          .order("created_at", { ascending: true }),
      ]);
      if (tickets.error) throw tickets.error;
      if (avulsas.error) throw avulsas.error;

      const itens = new Map<string, ItemViabilizacao[]>();
      for (const t of (tickets.data ?? []) as unknown as Array<Record<string, unknown>>) {
        const cobrancas = ((t.charges as LinhaCobranca[] | null) ?? [])
          .slice()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const maisRecente = cobrancas[0] ?? null;
        const real = cobrancas.find((c) => c.status !== "draft" && !c.archived_at) ?? null;
        // Mesma leitura da lista: a cobrança real manda; senão a mais recente; senão o rascunho do ticket.
        const exibida = real ?? maisRecente;
        const property = (t.property as { id: string; name: string } | null) ?? null;
        const item: ItemViabilizacao = {
          id: t.id as string,
          subject: t.subject as string,
          status: t.status as TicketStatus,
          created_at: t.created_at as string,
          property,
          owner: (t.owner as DonoWhatsapp | null) ?? null,
          cost_responsible: (t.cost_responsible as string | null) ?? null,
          amount_cents: exibida?.amount_cents ?? (t.charge_draft_amount_cents as number | null) ?? null,
          management_contribution_cents:
            exibida?.management_contribution_cents ?? (t.charge_draft_management_contribution_cents as number | null) ?? null,
          service_type: exibida?.service_type || (t.charge_draft_category as string | null) || null,
          attachments_count: ((t.ticket_attachments as { count: number }[] | null)?.[0]?.count as number) ?? 0,
          on_hold: t.on_hold === true,
          ticket_type: t.ticket_type as string,
          kind: (t.kind as string | null) ?? null,
          list_status: t.status === "concluido" ? "feito" : "em_progresso",
          cobranca: real
            ? {
                id: real.id,
                status: real.status,
                due_date: real.due_date,
                paid_at: real.paid_at,
                amount_cents: real.amount_cents,
                management_contribution_cents: real.management_contribution_cents,
                created_at: real.created_at,
              }
            : null,
        };
        if (!property) continue;
        const lista = itens.get(property.id) ?? [];
        lista.push(item);
        itens.set(property.id, lista);
      }

      const avulsasPorImovel = new Map<string, CobrancaAvulsa[]>();
      for (const c of (avulsas.data ?? []) as unknown as CobrancaAvulsa[]) {
        const lista = avulsasPorImovel.get(c.property_id) ?? [];
        lista.push(c);
        avulsasPorImovel.set(c.property_id, lista);
      }

      return { itens, avulsas: avulsasPorImovel };
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Apoio ao formulário: contas de proprietário, fichas e sugestões           */
/* ------------------------------------------------------------------------ */

/** Proprietários e pré-cadastros (pending_owner) para ligar ao imóvel novo. */
export function useContasProprietarios(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "contas"],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ContaProprietario[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, phone, email, role, notificar_whatsapp")
        .in("role", ["owner", "pending_owner"])
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContaProprietario[];
    },
  });
}

export interface ImovelDoPortal {
  id: string;
  name: string;
  address: string | null;
  owner_id: string;
  owner: { id: string; name: string; phone: string | null; email: string } | null;
}

/** Imóveis do portal com endereço e dono, para "já está cadastrado" e para vincular. */
export function useImoveisDoPortal(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "imoveis-portal"],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ImovelDoPortal[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, owner_id, owner:profiles!properties_owner_id_fkey(id, name, phone, email)")
        .is("archived_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ImovelDoPortal[];
    },
  });
}

export interface FichaCaptacao {
  id: string;
  property_nickname: string | null;
  property_address: string;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string;
  owner_profile_id: string | null;
  created_at: string;
}

/** Fichas de /cadastro-imovel (as mais recentes), para puxar nome, endereço e proprietário. */
export function useFichasCaptacao(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "fichas"],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FichaCaptacao[]> => {
      const { data, error } = await supabase
        .from("property_intake_submissions")
        .select("id, property_nickname, property_address, owner_name, owner_phone, owner_email, owner_profile_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FichaCaptacao[];
    },
  });
}

export interface SugestaoImovel {
  id: string;
  name: string;
  address: string | null;
  owner_id: string;
  created_at: string;
}

const DIAS_SUGESTAO = 240;

/**
 * Imóveis recentes do portal que ainda não têm anúncio na Hostex nem
 * viabilização: provavelmente estão em preparação e só falta registrar.
 */
export function useSugestoesImoveis(ativo = true) {
  return useQuery({
    queryKey: [CHAVE_VIABILIZACOES, "sugestoes"],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SugestaoImovel[]> => {
      const desde = new Date(Date.now() - DIAS_SUGESTAO * 86_400_000).toISOString();
      const [imoveis, hostex, viabs] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, address, owner_id, created_at")
          .is("archived_at", null)
          .gte("created_at", desde)
          .order("created_at", { ascending: false }),
        supabase.from("hostex_properties").select("property_id").not("property_id", "is", null),
        tabelaViabilizacoes().select("property_id").not("property_id", "is", null),
      ]);
      if (imoveis.error) throw imoveis.error;
      const comHostex = new Set((hostex.data ?? []).map((h) => h.property_id as string));
      const comViab = new Set(((viabs.data ?? []) as { property_id: string }[]).map((v) => v.property_id));
      return ((imoveis.data ?? []) as SugestaoImovel[]).filter((p) => !comHostex.has(p.id) && !comViab.has(p.id));
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Mutations da viabilização                                                 */
/* ------------------------------------------------------------------------ */

export interface DadosViabilizacao {
  nome: string;
  endereco: string | null;
  proprietarioNome: string | null;
  proprietarioTelefone: string | null;
  proprietarioEmail: string | null;
  etapa: EtapaViabilizacao;
  visitaEm: string | null;
  estreiaPrevista: string | null;
  observacoes: string | null;
}

export interface NovaViabilizacao extends DadosViabilizacao {
  /** Imóvel que já existe no portal (o nome e o endereço dele mandam). */
  propertyId: string | null;
  /** Conta do proprietário: com ela, o imóvel é criado no portal na hora. */
  ownerId: string | null;
  autorId: string;
  arquivos: File[];
}

/** Cria o imóvel no portal para um proprietário que já tem conta. */
async function criarImovelNoPortal(dados: { nome: string; endereco: string | null; ownerId: string; telefone: string | null }) {
  const { data, error } = await supabase
    .from("properties")
    .insert({
      // Os imóveis do portal têm nome em maiúsculas (é o que casa com a Hostex).
      name: dados.nome.trim().toUpperCase(),
      address: dados.endereco?.trim() || null,
      owner_id: dados.ownerId,
      owner_phone: dados.telefone?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function colunasDe(d: Partial<DadosViabilizacao>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (d.nome !== undefined) c.nome = d.nome.trim();
  if (d.endereco !== undefined) c.endereco = d.endereco?.trim() || null;
  if (d.proprietarioNome !== undefined) c.proprietario_nome = d.proprietarioNome?.trim() || null;
  if (d.proprietarioTelefone !== undefined) c.proprietario_telefone = d.proprietarioTelefone?.trim() || null;
  if (d.proprietarioEmail !== undefined) c.proprietario_email = d.proprietarioEmail?.trim() || null;
  if (d.etapa !== undefined) c.etapa = d.etapa;
  if (d.visitaEm !== undefined) c.visita_em = d.visitaEm || null;
  if (d.estreiaPrevista !== undefined) c.estreia_prevista = d.estreiaPrevista || null;
  if (d.observacoes !== undefined) c.observacoes = d.observacoes?.trim() || null;
  return c;
}

function invalidarTudo(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [CHAVE_VIABILIZACOES] });
  queryClient.invalidateQueries({ queryKey: [CHAVE_LISTA_MANUTENCOES] });
  queryClient.invalidateQueries({ queryKey: ["imoveis-ajuste"] });
  queryClient.invalidateQueries({ queryKey: ["properties-inline-add"] });
}

export function useCriarViabilizacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nova: NovaViabilizacao): Promise<string> => {
      let propertyId = nova.propertyId;
      let imovelCriadoAqui: string | null = null;
      if (!propertyId && nova.ownerId) {
        propertyId = await criarImovelNoPortal({
          nome: nova.nome,
          endereco: nova.endereco,
          ownerId: nova.ownerId,
          telefone: nova.proprietarioTelefone,
        });
        imovelCriadoAqui = propertyId;
      }
      // O id nasce aqui para os anexos irem direto para a pasta do registro.
      const id = novoId();
      const anexos = await enviarAnexos(nova.autorId, id, nova.arquivos);
      const { error } = await tabelaViabilizacoes().insert({
        id,
        anexos,
        property_id: propertyId,
        ...colunasDe(nova),
      });
      if (error) {
        await removerAnexos(anexos);
        // O imóvel que nasceu nesta mesma ação não pode ficar órfão (só admin apaga; se falhar, fica).
        if (imovelCriadoAqui) await supabase.from("properties").delete().eq("id", imovelCriadoAqui);
        throw error;
      }
      return id;
    },
    onSettled: () => invalidarTudo(queryClient),
  });
}

export function useAtualizarViabilizacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, propertyId, mudanca }: { id: string; propertyId: string | null; mudanca: Partial<DadosViabilizacao> }) => {
      const colunas = colunasDe(mudanca);
      const { data, error } = await tabelaViabilizacoes().update(colunas).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para mudar este imóvel.");
      // Nome e endereço do imóvel do portal acompanham (é lá que a lista de manutenções lê).
      if (propertyId && (mudanca.nome !== undefined || mudanca.endereco !== undefined)) {
        const doImovel: Record<string, unknown> = {};
        if (mudanca.nome !== undefined) doImovel.name = mudanca.nome.trim().toUpperCase();
        if (mudanca.endereco !== undefined) doImovel.address = mudanca.endereco?.trim() || null;
        const { error: erroImovel } = await supabase.from("properties").update(doImovel).eq("id", propertyId);
        if (erroImovel) throw erroImovel;
      }
    },
    onSettled: () => invalidarTudo(queryClient),
  });
}

/** Liga uma viabilização sem imóvel a um imóvel do portal (existente ou criado agora). */
export function useVincularImovel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      viabilizacao,
      propertyId,
      ownerId,
    }: {
      viabilizacao: Viabilizacao;
      /** Imóvel que já existe no portal. */
      propertyId?: string | null;
      /** Ou a conta do proprietário, para criar o imóvel agora. */
      ownerId?: string | null;
    }) => {
      let alvo = propertyId ?? null;
      if (!alvo && ownerId) {
        alvo = await criarImovelNoPortal({
          nome: viabilizacao.nome,
          endereco: viabilizacao.endereco,
          ownerId,
          telefone: viabilizacao.proprietario_telefone,
        });
      }
      if (!alvo) throw new Error("Escolha o imóvel ou a conta do proprietário.");
      const { data, error } = await tabelaViabilizacoes().update({ property_id: alvo }).eq("id", viabilizacao.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para mudar este imóvel.");
      return alvo;
    },
    onSettled: () => invalidarTudo(queryClient),
  });
}

export function useApagarViabilizacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: Viabilizacao) => {
      const { data, error } = await tabelaViabilizacoes().delete().eq("id", v.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Só o admin ou quem criou apaga este registro.");
      if (v.anexos.length > 0) await removerAnexos(v.anexos);
    },
    onSettled: () => invalidarTudo(queryClient),
  });
}

/* ------------------------------------------------------------------------ */
/* Mutations dos itens                                                       */
/* ------------------------------------------------------------------------ */

export interface NovoItem {
  propertyId: string;
  ownerId: string;
  autorId: string;
  subject: string;
  amountCents: number | null;
  costResponsible: "owner" | "pm" | "guest" | "pending";
}

function invalidarItens(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [CHAVE_VIABILIZACOES, "itens"] });
  queryClient.invalidateQueries({ queryKey: [CHAVE_LISTA_MANUTENCOES] });
  queryClient.invalidateQueries({ queryKey: [CHAVE_COBRANCAS_LISTA] });
  queryClient.invalidateQueries({ queryKey: ["painel"] });
}

/**
 * Item novo = manutenção do imóvel, igual à inclusão rápida da lista.
 * `essential` fica marcado: é trabalho da RIOS para o imóvel entrar no ar,
 * sem a decisão "quem conserta" que o proprietário veria numa estrutural.
 */
export function useCriarItemViabilizacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itens: NovoItem[]): Promise<number> => {
      if (itens.length === 0) return 0;
      const { error } = await supabase.from("tickets").insert(
        itens.map((i) => ({
          subject: i.subject.trim(),
          description: i.subject.trim(),
          property_id: i.propertyId,
          owner_id: i.ownerId,
          created_by: i.autorId,
          ticket_type: "manutencao" as const,
          kind: "maintenance",
          status: "novo" as const,
          cost_responsible: i.costResponsible,
          essential: true,
          charge_draft_amount_cents: i.amountCents && i.amountCents > 0 ? i.amountCents : null,
          charge_draft_title: i.subject.trim(),
        })),
      );
      if (error) throw error;
      return itens.length;
    },
    onSettled: () => invalidarItens(queryClient),
  });
}

/** Edição em linha de um item: mesma função da lista de manutenções. */
export function useSalvarCampoItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, field, value }: { item: ItemViabilizacao; field: string; value: unknown }): Promise<ResultadoCampo> =>
      salvarCampoManutencao({ id: item.id, field, value, isCharge: false, ticket: item }),
    onSettled: () => invalidarItens(queryClient),
  });
}

export function useApagarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidarItens(queryClient),
  });
}

/** Recarrega os itens depois de uma ação feita fora dos hooks (anexo, chat, lote). */
export function useRecarregarItens() {
  const queryClient = useQueryClient();
  return () => invalidarItens(queryClient);
}
