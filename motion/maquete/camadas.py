# Tira da pintura as camadas da maquete de um modelo e grava o que a página usa.
#
#   python -I motion/maquete/camadas.py <pasta da arte do modelo> [pasta de saída = public/melhorias/<modelo>]
#
# Entra (da pasta da arte): pintura-base.png, pintura-<cena>.png, mascara-<item>.png, prof-<cena>.png, cena.json
# Sai (na pasta de saída):
#   base.webp               a maquete sem melhorias
#   camada-<item>.webp      só o que a melhoria acrescenta, recortado, com transparência
#   prof-base.webp          profundidade da base (R = fundo no chão, G = fundo na vista, B = tem maquete)
#   prof-<item>.webp        profundidade do pedaço que a melhoria ocupa (mesmo recorte da camada)
#   maquete.json            onde cada camada entra, o marcador de cada uma, o foco de cada cômodo e as constantes do giro
#   completa-960.webp       a maquete com tudo, pequena (para a chamada da visão geral)
#
# A camada é a diferença entre a pintura com a melhoria e a pintura da base, só em volta de onde a melhoria
# foi posta: o GPT Image mexe um pouco no resto da imagem a cada pedido, e isso não pode vazar para a página.
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ARTE = sys.argv[1].rstrip("/\\") + "/"
cena = json.load(open(ARTE + "cena.json", encoding="utf-8"))
MODELO = cena["modelo"]
SAIDA = (sys.argv[2] if len(sys.argv) > 2 else f"public/melhorias/{MODELO}").rstrip("/\\") + "/"
FOLGA = 12  # a mesma de blocos.py: até onde a pintura pôde mudar em volta de cada bloco
# o pintor desenha algumas coisas maiores que o bloco (a coifa da churrasqueira, os pés da rede): mais folga para elas
FOLGA_DE = {"churrasqueira": 48, "rede": 30, "ducha": 26, "espreguicadeiras": 22, "varanda": 20, "mesa_trabalho": 22}
L, A = cena["largura"], cena["altura"]
os.makedirs(SAIDA, exist_ok=True)


def abre(nome, modo="RGB"):
    im = Image.open(ARTE + nome).convert(modo)
    assert im.size == (L, A), (nome, im.size)
    return im


def degrau(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def filtra(a, *filtros):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    for f in filtros:
        im = im.filter(f)
    return np.asarray(im, dtype=np.float32) / 255


def cresce(m, raio):
    """Engorda a máscara em `raio` pontos. O MaxFilter do PIL leva minutos com raio grande; em passos de 7 é rápido."""
    im = Image.fromarray((m > 0).astype(np.uint8) * 255)
    for _ in range(raio // 3):
        im = im.filter(ImageFilter.MaxFilter(7))
    return np.asarray(im, dtype=np.float32) / 255


def estende(prof):
    """Leva a profundidade da maquete para o fundo vazio em volta dela.

    Sem isso o fundo fica "lá longe" e, ao girar, o brilho em volta da base se descola e a borda estica.
    Cada ponto vazio recebe a média dos pontos de maquete mais próximos (pirâmide: soma de 2 em 2 e volta).
    """
    dentro = (prof[..., 2] >= 250).astype(np.float32)
    niveis = [(prof[..., :2].astype(np.float32) * dentro[..., None], dentro)]
    while min(niveis[-1][1].shape) > 2:
        v, w = niveis[-1]
        h2, l2 = (v.shape[0] + 1) // 2, (v.shape[1] + 1) // 2
        v = np.pad(v, ((0, h2 * 2 - v.shape[0]), (0, l2 * 2 - v.shape[1]), (0, 0)))
        w = np.pad(w, ((0, h2 * 2 - w.shape[0]), (0, l2 * 2 - w.shape[1])))
        niveis.append((v.reshape(h2, 2, l2, 2, 2).sum(axis=(1, 3)), w.reshape(h2, 2, l2, 2).sum(axis=(1, 3))))
    est = niveis[-1][0] / np.maximum(niveis[-1][1], 1e-6)[..., None]
    for v, w in reversed(niveis[:-1]):
        sobe = np.repeat(np.repeat(est, 2, axis=0), 2, axis=1)[: v.shape[0], : v.shape[1]]
        est = np.where((w > 1e-6)[..., None], v / np.maximum(w, 1e-6)[..., None], sobe)
    liso = np.dstack([np.asarray(Image.fromarray(est[..., c].clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) for c in (0, 1)])
    fora = 1 - filtra(dentro, ImageFilter.GaussianBlur(1.5))[..., None]
    final = prof[..., :2].astype(np.float32) * (1 - fora) + liso * fora
    final = np.where(dentro[..., None] > 0, prof[..., :2].astype(np.float32), final)
    return np.dstack([final, prof[..., 2:3].astype(np.float32)]).clip(0, 255).astype(np.uint8)


base = abre("pintura-base.png")
base_f = np.asarray(base, dtype=np.float32)
base.save(SAIDA + "base.webp", quality=88, method=6)
Image.fromarray(estende(np.asarray(abre("prof-base.png")))).save(SAIDA + "prof-base.webp", lossless=True, method=4)

cenas = sorted({i["cena"] for i in cena["itens"].values()})
pinturas = {c: np.asarray(abre(f"pintura-{c}.png"), dtype=np.float32) for c in cenas}
profs = {c: np.asarray(abre(f"prof-{c}.png")) for c in cenas}
mascaras = {n: np.asarray(abre(f"mascara-{n}.png", "L"), dtype=np.float32) / 255 for n in cena["itens"]}

# a decoração entra primeiro (fica por baixo); as trocas (sofá-cama, lava e seca) por último, por cima do que substituem
ORDEM_CENA = {"decoracao": 0, "itens": 1, "trocas": 2}
ordem = sorted(cena["itens"], key=lambda n: (ORDEM_CENA[cena["itens"][n]["cena"]], n))
saida = {
    "modelo": MODELO, "largura": L, "altura": A,
    "px_por_metro": cena["px_por_metro"], "sen_altura": cena["sen_altura"],
    "faixa_h_px": cena["faixa_h_px"], "faixa_d_px": cena["faixa_d_px"],
    "comodos": cena["comodos"], "camadas": [],
}
prova = base_f.copy()
for nome in ordem:
    info = cena["itens"][nome]
    pint = pinturas[info["cena"]]
    m_todo = mascaras[nome]
    cx0, cy0, cx1, cy1 = info["caixa"]
    folga = FOLGA_DE.get(nome, FOLGA)
    M = folga * 3
    x0, y0, x1, y1 = max(cx0 - M, 0), max(cy0 - M, 0), min(cx1 + M, L), min(cy1 + M, A)
    m = m_todo[y0:y1, x0:x1]
    onde = (m > 0.02).astype(np.float32)
    # região em que a pintura pôde mudar, com a borda desfeita para dentro
    regiao = degrau(filtra(cresce(onde, folga), ImageFilter.GaussianBlur(4)), 0.5, 0.95)
    # o que é de outra melhoria da mesma pintura não entra nesta camada
    outros = np.zeros_like(onde)
    for n2, i2 in cena["itens"].items():
        if n2 != nome and i2["cena"] == info["cena"]:
            outros = np.maximum(outros, (mascaras[n2][y0:y1, x0:x1] > 0.02).astype(np.float32))
    if outros.any():
        regiao = regiao * (1 - filtra(outros, ImageFilter.MaxFilter(5), ImageFilter.GaussianBlur(1.5)))
    dif = np.abs(pint[y0:y1, x0:x1] - base_f[y0:y1, x0:x1]).max(axis=2) / 255
    mudou = degrau(filtra(dif, ImageFilter.GaussianBlur(1.2)) * 255, 9, 26)
    mudou = filtra(mudou, ImageFilter.MaxFilter(5), ImageFilter.GaussianBlur(1.5))
    miolo = filtra(onde, ImageFilter.MinFilter(5), ImageFilter.GaussianBlur(1.5))
    alfa = np.maximum(mudou, miolo) * regiao
    ys, xs = np.nonzero(alfa > 0.01)
    if len(xs) == 0:
        print(f"{nome}: nada mudou na pintura; fica de fora")
        continue
    a0, b0, a1, b1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    rec_a = alfa[b0:b1, a0:a1]
    cor = pint[y0 + b0:y0 + b1, x0 + a0:x0 + a1]
    rgba = np.dstack([cor * (rec_a[..., None] > 0), rec_a * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(SAIDA + f"camada-{nome}.webp", quality=90, alpha_quality=100, method=6)
    pm = filtra(m, ImageFilter.MaxFilter(3))[b0:b1, a0:a1] * 255
    pr = profs[info["cena"]][y0 + b0:y0 + b1, x0 + a0:x0 + a1]
    Image.fromarray(np.dstack([pr[..., 0], pr[..., 1], np.full_like(pr[..., 0], 255), pm.astype(np.uint8)]).astype(np.uint8), "RGBA").save(
        SAIDA + f"prof-{nome}.webp", lossless=True, method=4)
    forte = m_todo > 0.5
    prof_centro = [round(float(np.median(profs[info["cena"]][..., c][forte])) / 255, 4) for c in (0, 1)] if forte.any() else [0.5, 0.5]
    if "marca" in info:
        mxp, myp, mtopo, mh, md = info["marca"]
        marca = {"x": round(mxp, 1), "y": round(myp, 1), "topo": round(mtopo, 1), "prof": [round(mh, 4), round(md, 4)]}
    else:
        marca = {"x": round(info["centro"][0], 1), "y": round(info["centro"][1], 1), "topo": cy0 + 4, "prof": prof_centro}
    saida["camadas"].append({"id": nome, "x": x0 + a0, "y": y0 + b0, "l": a1 - a0, "a": b1 - b0, "comodo": info["comodo"], "marca": marca})
    a3 = alfa[b0:b1, a0:a1][..., None]
    alvo = prova[y0 + b0:y0 + b1, x0 + a0:x0 + a1]
    if info["cena"] != "trocas" or nome == "sofa_cama":
        prova[y0 + b0:y0 + b1, x0 + a0:x0 + a1] = alvo * (1 - a3) + cor * a3
    print(f"{nome:17s} {a1 - a0:4d}x{b1 - b0:<4d} {os.path.getsize(SAIDA + f'camada-{nome}.webp') // 1024:4d} KB")

json.dump(saida, open(SAIDA + "maquete.json", "w", encoding="utf-8"), ensure_ascii=False)
completa = Image.fromarray(prova.clip(0, 255).astype(np.uint8))
completa.save(ARTE + "prova-completa.png")
completa.resize((960, round(960 * A / L)), Image.LANCZOS).save(SAIDA + "completa-960.webp", quality=82, method=6)
print(MODELO, "total", sum(os.path.getsize(SAIDA + f) for f in os.listdir(SAIDA)) // 1024, "KB em", len(os.listdir(SAIDA)), "arquivos")
