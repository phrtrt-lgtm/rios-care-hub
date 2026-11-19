#!/usr/bin/env python3
"""Junta as respostas do PriceLabs numa pasta, uma por imóvel, e confere se cada uma é do imóvel anotado.

O MCP devolve cada `get_listing_neighborhood_market` em um arquivo solto (a resposta tem
160 a 550 KB), com um carimbo no nome, e a resposta não diz de qual listagem é. Anote num
`mapa.tsv` qual carimbo é de qual imóvel, na ordem das chamadas:

    CLAUDIO2<TAB>1795049269551
    ANDREA<TAB>1795049305974

Uso:
    python -I organizar-respostas.py mapa.tsv imoveis.json <pasta-dos-arquivos-do-mcp> <pasta-de-saida>

Copia cada resposta para `<pasta-de-saida>/<NOME sem acento>.json` e imprime a distância
entre o ponto da resposta e o ponto do imóvel na Hostex. Acima de 0,0015 grau (~150 m)
a anotação provavelmente está trocada; a exceção conhecida é ROGERIO3 (~1 km), que entra
no script de carga com `--forcar ROGERIO3=ROGERIO3.json`.
"""
import glob
import json
import math
import os
import shutil
import sys
import unicodedata

if len(sys.argv) != 5:
    sys.exit(__doc__)
mapa_tsv, imoveis_json, pasta_mcp, pasta_saida = sys.argv[1:5]
TOLERANCIA = 0.0015


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


imoveis = {i["nome"]: i for i in json.load(open(imoveis_json, encoding="utf-8"))}
os.makedirs(pasta_saida, exist_ok=True)
problemas = 0
for linha in open(mapa_tsv, encoding="utf-8"):
    linha = linha.strip()
    if not linha:
        continue
    nome, carimbo = linha.split("\t")
    achados = glob.glob(os.path.join(pasta_mcp, f"*{carimbo}*"))
    if len(achados) != 1:
        print(f"{nome}: {len(achados)} arquivos com o carimbo {carimbo}")
        problemas += 1
        continue
    bruto = json.load(open(achados[0], encoding="utf-8"))
    dados = bruto.get("data", {}).get("data", {})
    valido = bool(bruto.get("success")) and "Market KPI" in dados and isinstance(dados.get("lat"), (int, float))
    imovel = imoveis[nome]
    distancia = math.hypot(dados["lat"] - float(imovel["lat"]), dados["lng"] - float(imovel["lng"])) if valido else float("nan")
    destino = os.path.join(pasta_saida, sem_acento(nome) + ".json")
    shutil.copyfile(achados[0], destino)
    aviso = ""
    if not valido:
        aviso = "  <-- resposta sem mercado"
    elif distancia > TOLERANCIA:
        aviso = "  <-- longe do ponto da Hostex"
    problemas += bool(aviso)
    print(f"{sem_acento(nome):14s} {os.path.basename(destino):18s} distancia={distancia:.5f}{aviso}")
print(f"\nproblemas: {problemas}")
