// Conteúdo da mini landing de captação (/cadastro-imovel). Espelha o site
// rioshospedagens.com.br (lido em 2026-10-14): ao mudar número, comissão ou
// link lá, mude aqui também.
import {
  Camera,
  Globe,
  Handshake,
  LineChart,
  MapPin,
  Smartphone,
  Sofa,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const SITE = "https://rioshospedagens.com.br";

export const LINKS = {
  site: SITE,
  comoTrabalhamos: `${SITE}/como-trabalhamos`,
  simulador: `${SITE}/#simulador`,
  portfolio: `${SITE}/portfolio`,
  clube: `${SITE}/clube`,
  app: `${SITE}/app-rios`,
  planos: `${SITE}/planos`,
  faq: `${SITE}/faq`,
  contato: `${SITE}/contato`,
  instagram: "https://instagram.com/rioshospedagens",
  guia: "https://guia.rioshospedagens.com.br",
  email: "contato@rioshospedagens.com.br",
};

export const NUMEROS = [
  { valor: "11", rotulo: "anos de gestão em Cabo Frio" },
  { valor: "60", rotulo: "imóveis sob gestão" },
  { valor: "2.500", rotulo: "estadias por ano" },
  { valor: "+3.000", rotulo: "avaliações no Airbnb" },
];

export const PASSOS = [
  {
    titulo: "Cadastre o imóvel",
    texto: "O formulário desta página leva menos de 2 minutos. Só o essencial; o resto levantamos juntos.",
  },
  {
    titulo: "Receba o diagnóstico gratuito",
    texto: "Potencial do imóvel, projeção de receita e plano de ação, sem compromisso e sem custo.",
  },
  {
    titulo: "Entre no Owners Club",
    texto: "Sem taxa de setup e sem mensalidade. A comissão só existe sobre reserva efetivada.",
  },
];

export interface Incluso {
  icone: LucideIcon;
  titulo: string;
  texto: string;
}

export const INCLUSOS: Incluso[] = [
  {
    icone: Sofa,
    titulo: "Decoração e home staging",
    texto: "Curadoria, enxoval e roupa de cama num pacote só. Mancha, troca e desgaste ficam por nossa conta.",
  },
  {
    icone: Camera,
    titulo: "Fotografia profissional",
    texto: "Mais de 40 fotos feitas pelo CEO fotógrafo, e fotos novas a cada melhoria no imóvel.",
  },
  {
    icone: Globe,
    titulo: "Anúncio nas plataformas",
    texto: "Airbnb, Booking, Expedia e Google, com perfil de anfitrião de 11 anos de história.",
  },
  {
    icone: LineChart,
    titulo: "Precificação dinâmica",
    texto: "Diária ajustada todo dia com 11 anos de dados da região, não com chute.",
  },
  {
    icone: MapPin,
    titulo: "Operação local",
    texto: "Equipe própria em Cabo Frio: limpeza, manutenção e chegada ao imóvel em até 15 minutos.",
  },
  {
    icone: Smartphone,
    titulo: "Aplicativo próprio",
    texto: "Vistorias com foto e vídeo, chamados, mensagens dos hóspedes, relatórios e repasses no seu celular.",
  },
  {
    icone: Wrench,
    titulo: "Aporte em manutenções",
    texto: "Cerca de 25% de desconto nas manutenções, com parte do custo bancada pela RIOS.",
  },
  {
    icone: Handshake,
    titulo: "Transparência total",
    texto: "Você vê todas as conversas com os hóspedes nas plataformas. Nada acontece sem você saber.",
  },
];

export const RESULTADOS = [
  { imovel: "Apartamento 2 quartos", bairro: "Algodoal", antes: "R$ 4.200", depois: "R$ 8.100", ganho: "+93%", ocupacao: "89%" },
  { imovel: "Cobertura vista mar", bairro: "Braga", antes: "R$ 6.800", depois: "R$ 9.200", ganho: "+35%", ocupacao: "92%" },
  { imovel: "Apartamento compacto", bairro: "Braga", antes: "R$ 0", depois: "R$ 7.200", ganho: "do zero", ocupacao: "85%" },
];

export const CIDADES = [
  { nome: "Cabo Frio", comissao: "22%", sede: true },
  { nome: "Búzios", comissao: "25%" },
  { nome: "Arraial do Cabo", comissao: "25%" },
  { nome: "Peró", comissao: "25%" },
];

export const PERGUNTAS = [
  {
    pergunta: "Quanto custa?",
    resposta:
      "Comissão de 22% em Cabo Frio e 25% na região, já com decoração, fotos, precificação e o aplicativo. Sem taxa de setup, sem mensalidade e sem taxa avulsa.",
  },
  {
    pergunta: "Posso usar o imóvel?",
    resposta: "Sim. Nas datas livres você se hospeda no seu próprio imóvel, pagando só a taxa de limpeza.",
  },
  {
    pergunta: "Como e quando recebo?",
    resposta:
      "No Airbnb o repasse é automático, cerca de 24 h depois do check-in. No Booking, no início do mês seguinte. Tudo acompanhado pelo aplicativo.",
  },
  {
    pergunta: "E se o hóspede causar dano?",
    resposta:
      "Toda estadia tem vistoria com foto e vídeo. Com prova, acionamos o AirCover ou o seguro da plataforma.",
  },
  {
    pergunta: "Preciso decorar antes?",
    resposta: "Não. A decoração não é pré-requisito: fazemos a curadoria e o home staging dentro da comissão.",
  },
  {
    pergunta: "E se eu quiser sair?",
    resposta: "Aviso de 30 dias, sem multa.",
  },
];
