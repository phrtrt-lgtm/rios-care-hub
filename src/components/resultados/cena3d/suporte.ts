/**
 * O aparelho desenha WebGL? Fica fora dos arquivos que importam o three.js de
 * propósito: quem não desenha nem chega a baixar o pacote 3D.
 */
let resposta: boolean | null = null;

export function suportaWebGL(): boolean {
  if (resposta != null) return resposta;
  try {
    const tela = document.createElement("canvas");
    const contexto = tela.getContext("webgl2") || tela.getContext("webgl");
    resposta = !!contexto;
    // devolve o contexto de teste na hora: o navegador só mantém alguns por página
    (contexto as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    resposta = false;
  }
  return resposta;
}

const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

/**
 * Estado do imóvel, tirado do endereço ("… Cabo Frio - RJ, CEP …"). Devolve
 * null quando o endereço não diz: o mapa então não desenha as rotas até o
 * imóvel, em vez de supor um destino.
 */
export function ufDoEndereco(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  if (/cabo frio|b[uú]zios|arraial do cabo|s[aã]o pedro da aldeia|rio de janeiro|unamar|tamoios/i.test(endereco)) return "RJ";
  // sigla solta, em maiúsculas e sem número logo depois ("AP 201" é apartamento, não Amapá)
  const siglas = [...endereco.matchAll(new RegExp(`(?:^|[\\s,/\\-–(])(${UFS})(?=$|[.;/)]|[\\s,\\-–]+(?!\\d))`, "g"))];
  return siglas.length > 0 ? siglas[siglas.length - 1][1] : null;
}
