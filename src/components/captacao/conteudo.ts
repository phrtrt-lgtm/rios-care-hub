// Conteúdo da landing de captação (/cadastro-imovel). Espelha o site
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
  instagram: "https://instagram.com/rioshospedagens",
  email: "contato@rioshospedagens.com.br",
};

export interface Numero {
  valor: number;
  prefixo?: string;
  rotulo: string;
}

export const NUMEROS: Numero[] = [
  { valor: 11, rotulo: "anos em Cabo Frio" },
  { valor: 60, rotulo: "imóveis sob gestão" },
  { valor: 2500, rotulo: "estadias por ano" },
  { valor: 3000, prefixo: "+", rotulo: "avaliações no Airbnb" },
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

export interface Resultado {
  imovel: string;
  bairro: string;
  antes: string;
  depois: string;
  ganho: string;
  ocupacao: string;
}

export const RESULTADOS: Resultado[] = [
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
