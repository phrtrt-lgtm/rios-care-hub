/**
 * Vocabulário do assistente de IA (PLANO_IA_AGENTE.md): nomes das
 * ferramentas em pt-BR, formato da resposta da function `ia-agente` e a
 * configuração guardada em `system_config.ia_agente`.
 */

export const FERRAMENTA_ROTULO: Record<string, string> = {
  listar_imoveis: "Imóveis",
  reservas_do_imovel: "Reservas",
  disponibilidade: "Disponibilidade",
  resultados_do_imovel: "Resultados",
  estado_dos_imoveis_hoje: "Estado de hoje",
  chamados: "Chamados",
  detalhe_chamado: "Chamado",
  cobrancas: "Cobranças",
  detalhe_cobranca: "Cobrança",
  cobrancas_em_atraso: "Em atraso",
  manutencoes: "Manutenções",
  buscar_proprietario: "Proprietário",
  pendencias_das_listas: "Pendências",
  vistorias_do_imovel: "Vistorias",
  hostex_bloquear_datas: "Bloquear datas na Hostex",
  hostex_liberar_datas: "Liberar datas na Hostex",
  abrir_chamado: "Abrir chamado",
  responder_chamado: "Responder chamado",
  mudar_status_chamado: "Mudar status do chamado",
  registrar_ajuste: "Registrar ajuste",
  registrar_compra: "Registrar compra",
  registrar_tarefa_rua: "Criar tarefa de rua",
};

export const rotuloFerramenta = (nome: string) => FERRAMENTA_ROTULO[nome] ?? nome.replace(/_/g, " ");

export interface AcaoPendente {
  id: string;
  ferramenta: string;
  resumo: string;
  entrada: Record<string, unknown>;
}

export interface RespostaAgente {
  conversa_id: string;
  mensagem_id: string | null;
  texto: string;
  acao_pendente?: AcaoPendente;
  ferramentas_usadas?: string[];
  fim: boolean;
}

export interface ConfigIA {
  ativo: boolean;
  modelo: string;
  effort: string;
  papeis: Record<string, boolean>;
  cotas: {
    mensagens_por_hora_equipe: number;
    mensagens_por_hora_proprietario: number;
    tokens_por_dia: number;
  };
  ferramentas_desligadas: string[];
}

export const CONFIG_IA_PADRAO: ConfigIA = {
  ativo: false,
  modelo: "claude-sonnet-5-5",
  effort: "medium",
  papeis: { admin: true, agent: true, maintenance: true, owner: false, cleaner: false },
  cotas: { mensagens_por_hora_equipe: 60, mensagens_por_hora_proprietario: 20, tokens_por_dia: 400000 },
  ferramentas_desligadas: [],
};

/** Lê o jsonb de `system_config.ia_agente` completando o que faltar. */
export function lerConfigIA(valor: unknown): ConfigIA {
  const v = (valor ?? {}) as Partial<ConfigIA>;
  return {
    ativo: v.ativo === true,
    modelo: typeof v.modelo === "string" ? v.modelo : CONFIG_IA_PADRAO.modelo,
    effort: typeof v.effort === "string" ? v.effort : CONFIG_IA_PADRAO.effort,
    papeis: { ...CONFIG_IA_PADRAO.papeis, ...(v.papeis ?? {}) },
    cotas: { ...CONFIG_IA_PADRAO.cotas, ...(v.cotas ?? {}) },
    ferramentas_desligadas: Array.isArray(v.ferramentas_desligadas) ? v.ferramentas_desligadas : [],
  };
}

export const MODELOS_IA = [
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (padrão)" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (rápido e barato)" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (mais capaz)" },
];

export const EFFORTS_IA = [
  { value: "low", label: "Baixo (rápido, pensa pouco)" },
  { value: "medium", label: "Médio (padrão)" },
  { value: "high", label: "Alto (pensa mais, custa mais)" },
];

export const PAPEIS_IA = [
  { valor: "admin", rotulo: "Administrador" },
  { valor: "agent", rotulo: "Agente" },
  { valor: "maintenance", rotulo: "Manutenção" },
  { valor: "owner", rotulo: "Proprietário" },
  { valor: "cleaner", rotulo: "Faxineira" },
];

export const SUGESTOES_EQUIPE = [
  "Quem sai hoje e quem entra amanhã?",
  "Quais cobranças estão vencidas?",
  "O que está pendente nas listas?",
  "Quais manutenções estão em progresso?",
  "Quais chamados estão abertos?",
  "Quem está com cobrança em atraso?",
];
