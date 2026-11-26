# Audita as fichas .md dos imóveis: o que falta em cada uma e que tipo de imóvel ela descreve.
#
#   python -I scripts/fichas/auditar_fichas.py [pasta das fichas] [arquivo de pendências] [json dos tipos]
#
# Nunca imprime nem copia o valor de um campo (as fichas têm senha de Wi-Fi e código de fechadura):
# só diz qual campo falta ou está vago.
import glob
import json
import os
import re
import sys
from datetime import date

PASTA = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/pc/Downloads/imoveis"
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PASTA, "_PENDENCIAS_FICHAS.md")
TIPOS = sys.argv[3] if len(sys.argv) > 3 else None

# arquivos da pasta que não são ficha de imóvel
NAO_FICHA = {"IDENTIDADE_VISUAL_RIOS", "PENDENCIAS", "PROMPT_LAYOUT_RIOS", "PROMPT_LOVABLE_RIOS", "REGRAS_ATENDIMENTO", "SUELI_test",
             "iCal_vs_API_Hostex_comparativo", "precos_pricelabs_para_hostex", "prompt_lovable_migracao_hostex", "GIOVANI"}

CAMPOS = [  # (nome, expressão que acha a linha, peso)
    ("Internet (rede e senha)", r"internet|wi-?fi", 1),
    ("Endereço", r"endere[cç]o", 1),
    ("Pode pet", r"pode pet", 2),
    ("Elevador", r"elevador", 3),
    ("Distância da praia", r"dist[aâ]ncia da praia", 3),
    ("Portaria 24h", r"portaria", 3),
    ("Condomínio", r"condom[ií]nio", 3),
    ("Garagem", r"garagem", 2),
    ("Zelador", r"zelador", 3),
    ("Tipo de imóvel", r"tipo de im[oó]vel", 2),
    ("Capacidade", r"capacidade", 1),
    ("Padrão do imóvel", r"padr[aã]o do im[oó]vel", 3),
    ("Check-in", r"check-?in", 1),
    ("Check-out", r"check-?out", 1),
    ("Método de entrada", r"m[eé]todo de entrada", 1),
    ("Andar", r"andar", 3),
    ("Tempo de limpeza", r"tempo de limpeza", 2),
    ("Cobrança por hóspede", r"cobran[cç]a por h[oó]spede", 2),
]
VAGO = re.compile(r"n[aã]o informad|a confirmar|\(confirmar|confirmar\)|preencher|⚠|\?\?|^<|^-+$|^n/?a$|pendente|a definir|verificar", re.I)
SECOES = [
    ("Regras da casa", r"regras"),
    ("Quartos", r"quarto|su[ií]te"),
    ("Sala", r"sala"),
    ("Cozinha", r"cozinha"),
    ("Banheiro", r"banheiro"),
    ("Lavanderia ou área de serviço", r"lavanderia|[aá]rea de servi[cç]o"),
    ("Localização", r"localiza[cç][aã]o"),
    ("Problemas conhecidos", r"problemas conhecidos"),
    ("Links do anúncio", r"links? do an[uú]ncio"),
]


def linhas_da_tabela(texto):
    """Linhas "| rótulo | valor |" da ficha, em (rótulo, valor)."""
    saida = []
    for linha in texto.splitlines():
        if not linha.strip().startswith("|"):
            continue
        celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
        if len(celulas) >= 2 and not set(celulas[0]) <= set("-: "):
            saida.append((celulas[0], " | ".join(celulas[1:])))
    return saida


def secoes(texto):
    """[(nível, título, corpo)] de cada título da ficha."""
    partes = re.split(r"(?m)^(#{1,4})\s+(.+?)\s*$", texto)
    return [(len(partes[i]), partes[i + 1], partes[i + 2]) for i in range(1, len(partes) - 2, 3)]


def auditar(nome, texto):
    falta, vago = [], []
    info = linhas_da_tabela(texto.split("\n## ", 2)[1] if texto.count("\n## ") else texto)
    todas = linhas_da_tabela(texto)
    valores = {}
    for campo, expr, peso in CAMPOS:
        achou = next((v for r, v in info if re.search(expr, r, re.I)), None)
        if achou is None:
            achou = next((v for r, v in todas if re.search(expr, r, re.I)), None)
        if achou is None:
            falta.append((peso, campo))
            continue
        valores[campo] = achou
        if not achou.strip() or VAGO.search(achou.strip()):
            vago.append((peso, campo))
    net = valores.get("Internet (rede e senha)", "")
    if net and not VAGO.search(net):
        if not re.search(r"senha", net, re.I):
            vago.append((1, "Internet: falta a senha"))
        if not re.search(r"rede", net, re.I):
            vago.append((2, "Internet: falta o nome da rede"))
    end = valores.get("Endereço", "")
    tipo = valores.get("Tipo de imóvel", "").lower()
    if end and not VAGO.search(end):
        if not re.search(r"\d{5}-?\d{3}", end):
            vago.append((3, "Endereço: sem CEP"))
        if not re.search(r"\d", re.sub(r"\d{5}-?\d{3}", "", end)):
            vago.append((1, "Endereço: sem número"))
        if re.search(r"apart|cobert|flat|studio", tipo) and not re.search(r"\b(ap|apto|apt|apartamento|bloco|bl|cobertura|cob|unidade|sala)\b\.?\s*\d|\b\d{3,4}\b(?!-)", re.sub(r"\d{5}-?\d{3}", "", end), re.I):
            vago.append((1, "Endereço: sem o número do apartamento"))
    ss = secoes(texto)
    for rotulo, expr in SECOES:
        if not any(re.search(expr, t, re.I) for _n, t, _c in ss):
            falta.append((2, f"Seção {rotulo}"))
    links = next((c for _n, t, c in ss if re.search(r"links? do an[uú]ncio", t, re.I)), "")
    if links:
        if not re.search(r"airbnb\.com(\.br)?/rooms/\d{5,}", links):
            vago.append((3, "Link do Airbnb sem o número do anúncio"))
        if re.search(r"booking", links, re.I) and not re.search(r"\b\d{6,9}\b", re.sub(r"rooms/\d+|editor/\d+", "", links)):
            vago.append((3, "Booking sem o número do hotel"))
    problemas = next((c for _n, t, c in ss if re.search(r"problemas conhecidos", t, re.I)), None)
    if problemas is not None and not [r for r, _v in linhas_da_tabela(problemas) if r and not re.search(r"^problema$", r, re.I)]:
        vago.append((3, "Problemas conhecidos em branco (confirmar que não há nenhum)"))
    if "<" in texto and re.search(r"<[A-Za-zÀ-ú /]{3,40}>", texto):
        vago.append((2, "Sobrou texto do modelo (entre < >)"))

    # ---- o tipo do imóvel, para os modelos de maquete ----
    quartos = 0
    for _n, t, c in ss:
        if re.search(r"quarto|su[ií]te", t, re.I) and not re.search(r"banheiro", t, re.I):
            cab = next((l for l in c.splitlines() if l.strip().startswith("|")), "")
            n = len([x for x in cab.strip().strip("|").split("|") if re.search(r"quarto|su[ií]te", x, re.I)])
            quartos += n if n else (1 if re.search(r"^\s*(su[ií]te|quarto)", t.strip("🛏️ "), re.I) else 0)
    titulo = texto.splitlines()[0] if texto else ""
    m = re.search(r"(\d)\s*quartos?", texto[:1500], re.I)
    cap = re.search(r"\d{1,2}", valores.get("Capacidade", ""))
    pav = [t for n, t, _c in ss if n == 2 and re.search(r"pavimento|andar|t[eé]rreo|piso", t, re.I)]
    baixo = texto.lower()
    return {
        "nome": nome, "falta": sorted(falta), "vago": sorted(vago),
        "tipo": tipo, "quartos": quartos or (int(m.group(1)) if m else None), "capacidade": int(cap.group()) if cap else None,
        "pavimentos": max(1, len(pav)) if pav else 1,
        "varanda": bool(re.search(r"^#{2,4}.*(varanda|sacada|terra[cç]o)", texto, re.I | re.M)),
        "area_externa": bool(re.search(r"^#{2,4}.*(quintal|jardim|[aá]rea externa|[aá]rea gourmet|piscina|deck)", texto, re.I | re.M)) and not re.search(r"condom", titulo, re.I),
        "piscina_privativa": bool(re.search(r"piscina (privativa|exclusiva|pr[oó]pria)|jacuzzi|hidromassagem", baixo)),
        "churrasqueira": "churrasqueira" in baixo,
        "titulo": re.sub(r"^#\s*", "", titulo)[:70],
    }


fichas = []
for caminho in sorted(glob.glob(os.path.join(PASTA, "*.md"))):
    nome = os.path.splitext(os.path.basename(caminho))[0]
    if nome.startswith("_") or nome in NAO_FICHA:
        continue
    fichas.append(auditar(nome, open(caminho, encoding="utf-8-sig", errors="replace").read()))

PESO = {1: "Crítico (a IA ou a equipe erram sem isso)", 2: "Importante", 3: "Completar quando der"}
linhas = [
    "# Pendências das fichas dos imóveis",
    "",
    f"_Gerado em {date.today().strftime('%d/%m/%Y')} por `scripts/fichas/auditar_fichas.py`, a partir de {len(fichas)} fichas em `Downloads/imoveis`. "
    "Compara cada ficha com o `_TEMPLATE.md`. Marque [x] ao resolver e rode de novo para atualizar._",
    "",
    "Como ler: **falta** = o campo ou a seção não existe na ficha; **vago** = existe, mas está em branco, com \"confirmar\", \"não informado\" ou incompleto.",
    "",
]
completas = [f["nome"] for f in fichas if not f["falta"] and not f["vago"]]
criticas = [f for f in fichas if any(p == 1 for p, _c in f["falta"] + f["vago"])]
linhas += ["## Resumo", "", "| | |", "|---|---|", f"| Fichas conferidas | {len(fichas)} |", f"| Sem nenhuma pendência | {len(completas)} |",
           f"| Com pendência crítica | {len(criticas)} |", f"| Itens em aberto no total | {sum(len(f['falta']) + len(f['vago']) for f in fichas)} |", ""]
conta = {}
for f in fichas:
    for _p, c in f["falta"] + f["vago"]:
        conta[c] = conta.get(c, 0) + 1
linhas += ["### O que mais falta", "", "| Item | Fichas |", "|---|---|"] + [f"| {c} | {n} |" for c, n in sorted(conta.items(), key=lambda kv: -kv[1])[:14]] + [""]
EXTRA = os.environ.get("SEM_FICHA", "")
if EXTRA:
    linhas += ["## Imóveis do portal sem ficha nenhuma", "", "A IA do portal não sabe nada destes. Criar a ficha pelo `_TEMPLATE.md`:", ""] + [f"- [ ] {n.strip()}" for n in EXTRA.split(",") if n.strip()] + [""]
for peso in (1, 2, 3):
    linhas += [f"## {PESO[peso]}", ""]
    for f in fichas:
        itens = [("falta", c) for p, c in f["falta"] if p == peso] + [("vago", c) for p, c in f["vago"] if p == peso]
        if not itens:
            continue
        linhas.append(f"### {f['nome']}")
        linhas += [f"- [ ] {c} ({q})" for q, c in itens] + [""]
if completas:
    linhas += ["## Fichas sem pendência", "", ", ".join(completas), ""]
open(SAIDA, "w", encoding="utf-8", newline="\n").write("\n".join(linhas))
if TIPOS:
    json.dump([{k: v for k, v in f.items() if k not in ("falta", "vago")} for f in fichas], open(TIPOS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(fichas), "fichas;", len(completas), "completas;", len(criticas), "com pendência crítica; itens:", sum(len(f["falta"]) + len(f["vago"]) for f in fichas))
for c, n in sorted(conta.items(), key=lambda kv: -kv[1])[:20]:
    print(f"{n:3d}  {c}".encode("ascii", "replace").decode())
