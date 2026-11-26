# Lê as fichas .md e diz, cômodo a cômodo, o que cada imóvel já tem: é a base do plano de melhorias.
#
#   python -I scripts/fichas/itens_das_fichas.py [pasta das fichas] [saida.json]
#
# Para cada ficha sai: o modelo de maquete (apto1, apto2, apto3, cobertura, casa_terrea, casa_duplex), quantos
# quartos tem e um sim/não por melhoria (`ar_q1`, `tv_q2`, `ar_sala`, `lavadora`...). Só sim e não: nenhum
# valor da ficha é copiado. O resultado vai para `properties.melhorias_ficha` (ver o README desta pasta).
import glob
import json
import os
import re
import sys

PASTA = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/pc/Downloads/imoveis"
SAIDA = sys.argv[2] if len(sys.argv) > 2 else None
NAO_FICHA = {"IDENTIDADE_VISUAL_RIOS", "PENDENCIAS", "PROMPT_LAYOUT_RIOS", "PROMPT_LOVABLE_RIOS", "REGRAS_ATENDIMENTO", "SUELI_test",
             "iCal_vs_API_Hostex_comparativo", "precos_pricelabs_para_hostex", "prompt_lovable_migracao_hostex", "GIOVANI"}
# nome do arquivo -> nome do imóvel no portal, quando diferem
NOME_NO_PORTAL = {"DANISEERENATO": "DANISE E RENATO", "JOÂO": "JOÃO", "LÉO": "LEO", "MARLONPERÓ": "MARLON PERÓ", "NALDOBÚZIOS": "NALDO BÚZIOS", "MH": "MARIAH"}

AR = r"ar[- ]condicionado|\bsplit\b"
TV = r"\btv\b|televis"


def secoes(texto):
    partes = re.split(r"(?m)^(#{1,4})\s+(.+?)\s*$", texto)
    return [(len(partes[i]), partes[i + 1], partes[i + 2]) for i in range(1, len(partes) - 2, 3)]


def tabela(corpo):
    linhas = [[c.strip().strip("*").strip() for c in l.strip().strip("|").split("|")] for l in corpo.splitlines() if l.strip().startswith("|")]
    return [l for l in linhas if not all(set(c) <= set("-: ") for c in l)]


def eh_quarto(t):
    return bool(re.search(r"quarto|su[ií]te|closet|dormit", t, re.I))


def quartos_da_tabela(corpo):
    """O texto de cada quarto. As fichas usam três formatos de tabela:
    uma coluna por quarto; uma linha por quarto ("Quarto | Tipo de cama | Comodidades");
    ou uma linha por item com Sim/Não em cada quarto ("Item | Quarto 1 | Quarto 2")."""
    saida = []
    blocos = [b for b in re.split(r"\n\s*\n", corpo) if "|" in b] or [corpo]
    for bloco in blocos:
        linhas = tabela(bloco)
        if not linhas:
            continue
        cab = linhas[0]
        generico = bool(re.match(r"(quarto|c[oô]modo|ambiente|dormit[oó]rio|item|itens|caracter[ií]stica|descri[cç][aã]o)s?$", cab[0], re.I))
        nao = lambda v: not v or bool(re.match(r"(n[aã]o|-+|sem|n/a)\b", v, re.I))
        if generico and any(eh_quarto(c) for c in cab[1:]):
            # uma linha por item, uma coluna por quarto
            for j in range(1, len(cab)):
                if eh_quarto(cab[j]):
                    saida.append("\n".join(f"{l[0]}: {l[j]}" for l in linhas[1:] if j < len(l) and not nao(l[j])))
        elif generico and len(cab) > 1:
            # uma linha por quarto; o cabeçalho diz o que é cada coluna ("Ar-condicionado | Sim")
            saida += ["\n".join(f"{cab[j]}: {l[j]}" for j in range(1, min(len(cab), len(l))) if not nao(l[j])) for l in linhas[1:] if eh_quarto(l[0])]
        else:
            cols = [j for j in range(len(cab)) if eh_quarto(cab[j])]
            saida += ["\n".join(l[j] for l in linhas[1:] if j < len(l)) for j in cols]
    return saida


def ler(texto):
    ss = secoes(texto)
    comuns = False
    quartos, sala, externo, cozinha, servico, banho = [], "", "", "", "", ""
    for nivel, titulo, corpo in ss:
        if nivel <= 2:
            comuns = bool(re.search(r"condom[ií]nio|[aá]reas comuns", titulo, re.I))
        if comuns:
            continue
        if nivel >= 3 and re.search(r"quarto|su[ií]te", titulo, re.I) and not re.search(r"banheiro", titulo, re.I):
            achou = quartos_da_tabela(corpo)
            if achou:
                quartos += achou
            elif corpo.strip() and re.match(r"\W*(quarto|su[ií]te)", titulo, re.I) and not re.search(r"quartos", titulo, re.I):
                quartos.append(corpo)
        elif re.search(r"sala", titulo, re.I):
            sala += corpo
        elif re.search(r"varanda|sacada|terra[cç]o|quintal|jardim|gourmet|externa|deck|piscina", titulo, re.I):
            externo += corpo
        elif re.search(r"cozinha", titulo, re.I):
            cozinha += corpo
        elif re.search(r"lavanderia|servi[cç]o", titulo, re.I):
            servico += corpo
        elif re.search(r"banheiro|lavabo", titulo, re.I):
            banho += corpo
    proprio = "\n".join(c for n, t, c in ss if not re.search(r"condom[ií]nio|[aá]reas comuns|localiza", t, re.I))
    tem = {}
    for i, q in enumerate(quartos[:6], 1):
        tem[f"ar_q{i}"] = bool(re.search(AR, q, re.I))
        tem[f"tv_q{i}"] = bool(re.search(TV, q, re.I))
    tem["ar_sala"] = bool(re.search(AR, sala, re.I)) if sala else None
    tem["tv_sala"] = bool(re.search(TV, sala, re.I)) if sala else None
    tem["sofa_cama"] = bool(re.search(r"sof[aá][- ]cama", sala or proprio, re.I))
    lava_seca = bool(re.search(r"lava\s*e\s*seca", proprio, re.I))
    tem["lava_seca"] = lava_seca
    tem["lavadora"] = lava_seca or bool(re.search(r"m[aá]quina de lavar(?! lou)|lavadora(?! de lou)", proprio, re.I))
    tem["secador"] = bool(re.search(r"secador de cabelo|secador(?!a)", proprio, re.I))
    tem["ferro"] = bool(re.search(r"ferro de passar|\bferro\b", proprio, re.I))
    tem["lava_loucas"] = bool(re.search(r"lava[- ]lou[cç]as", proprio, re.I))
    tem["purificador"] = bool(re.search(r"purificador|filtro de [aá]gua", proprio, re.I))
    tem["cafeteira"] = bool(re.search(r"c[aá]psula|nespresso|dolce gusto|tr[eê]s cora[cç][oõ]es", proprio, re.I))
    tem["blackout"] = bool(re.search(r"black\s*-?out", proprio, re.I))
    tem["mesa_trabalho"] = bool(re.search(r"escrivaninha|home office|mesa de trabalho|bancada de trabalho", proprio, re.I))
    tem["varanda"] = bool(re.search(r"mesa|cadeira|poltrona|sof[aá]|banco|pufe", externo, re.I)) if externo else None
    tem["espreguicadeiras"] = bool(re.search(r"espregui[cç]adeira", externo, re.I)) if externo else None
    tem["rede"] = bool(re.search(r"\brede\b(?! wi| de wi| el[eé]| de prote)", externo, re.I)) if externo else None
    tem["ducha"] = bool(re.search(r"ducha|chuveir[aã]o", externo, re.I)) if externo else None
    tem["churrasqueira"] = bool(re.search(r"churrasqueira", externo + sala + cozinha, re.I))
    tem["fechadura"] = bool(re.search(r"fechadura (digital|eletr[oô]nica|inteligente|smart)|smart lock", texto, re.I))
    m = re.search(r"pode pet\??\s*\|\s*([^|\n]+)", texto, re.I)
    tem["pet"] = (not re.match(r"\s*n[aã]o", m.group(1), re.I)) if m else None
    m = re.search(r"padr[aã]o do im[oó]vel\s*\|\s*([^|\n]+)", texto, re.I)
    tem["decoracao"] = bool(re.search(r"alto|luxo|premium|elegante|sofisticad", m.group(1), re.I)) if m else None

    m = re.search(r"tipo de im[oó]vel\s*\|\s*([^|\n]+)", texto, re.I)
    tipo = (m.group(1) if m else "").lower()
    pisos = len([t for n, t, _c in ss if n == 2 and re.search(r"pavimento|andar|t[eé]rreo|piso", t, re.I)])
    dois = pisos > 1 or bool(re.search(r"duplex|triplex|2 pavimentos|dois pavimentos|sobrado", tipo))
    nq = len(quartos) or 2
    if re.search(r"casa|mans", tipo):
        modelo = "casa_duplex" if dois else "casa_terrea"
    elif re.search(r"cobertura", tipo) and (dois or nq > 1) or dois:
        modelo = "cobertura"
    else:
        modelo = "apto1" if nq <= 1 else "apto2" if nq == 2 else "apto3"
    cap = re.search(r"capacidade\s*\|\s*[^|\n]*?(\d{1,2})", texto, re.I)
    return {"modelo": modelo, "quartos": len(quartos), "capacidade": int(cap.group(1)) if cap else None, "tem": tem}


def todas(pasta=PASTA):
    saida = {}
    for caminho in sorted(glob.glob(os.path.join(pasta, "*.md"))):
        nome = os.path.splitext(os.path.basename(caminho))[0]
        if nome.startswith("_") or nome in NAO_FICHA:
            continue
        saida[NOME_NO_PORTAL.get(nome, nome)] = ler(open(caminho, encoding="utf-8-sig", errors="replace").read())
    return saida


if __name__ == "__main__":
    dados = todas()
    if SAIDA:
        json.dump(dados, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    import collections
    print(len(dados), "fichas")
    print("modelos:", dict(collections.Counter(d["modelo"] for d in dados.values())))
    print("quartos lidos:", dict(sorted(collections.Counter(d["quartos"] for d in dados.values()).items())))
    conta = collections.Counter()
    sabe = collections.Counter()
    for d in dados.values():
        for k, v in d["tem"].items():
            if v is not None:
                sabe[k] += 1
                conta[k] += int(v)
    for k in sorted(sabe):
        print(f"{k:18s} tem {conta[k]:2d} de {sabe[k]:2d}")
