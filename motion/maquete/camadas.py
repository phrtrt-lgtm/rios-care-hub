# Tira da pintura as camadas da maquete e grava o que a página usa.
#
#   python -I motion/maquete/camadas.py <pasta da arte> [pasta de saída = public/melhorias] [manifesto = src/components/resultados/melhorias/maqueteManifesto.ts]
#
# Entra (da pasta da arte):
#   pintura-base.png        a maquete sem melhorias
#   pintura-decoracao.png   a mesma, com a decoração pintada
#   pintura-itens.png       a mesma, com as outras melhorias pintadas
#   mascara-<item>.png, prof-<cena>.png, cena.json   (de cena.py)
# Sai (na pasta de saída):
#   base.webp               a maquete sem melhorias
#   camada-<item>.webp      só o que a melhoria acrescenta, recortado, com transparência
#   prof-base.webp          profundidade da base (R = fundo no chão, G = fundo na vista, B = tem maquete)
#   prof-<item>.webp        profundidade do pedaço que a melhoria ocupa (mesmo recorte da camada)
#   (manifesto) maqueteManifesto.ts, dentro de src: onde cada camada entra, o foco de cada cômodo e as constantes do giro
#
# A camada é a diferença entre a pintura com a melhoria e a pintura da base, só em volta de onde a melhoria
# foi posta: o GPT Image mexe um pouco no resto da imagem a cada pedido, e isso não pode vazar para a página.
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ARTE = sys.argv[1].rstrip("/\\") + "/"
SAIDA = (sys.argv[2] if len(sys.argv) > 2 else "public/melhorias").rstrip("/\\") + "/"
MANIFESTO = sys.argv[3] if len(sys.argv) > 3 else "src/components/resultados/melhorias/maqueteManifesto.ts"
FOLGA = 12  # a mesma de blocos.py: até onde a pintura pôde mudar em volta de cada bloco

cena = json.load(open(ARTE + "cena.json", encoding="utf-8"))
L, A = cena["largura"], cena["altura"]
os.makedirs(SAIDA, exist_ok=True)


def abre(nome, modo="RGB"):
    im = Image.open(ARTE + nome).convert(modo)
    assert im.size == (L, A), (nome, im.size)
    return im


def degrau(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


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
    # alisa só o que foi inventado, para os degraus da pirâmide não aparecerem
    liso = np.dstack([np.asarray(Image.fromarray(est[..., c].clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) for c in (0, 1)])
    fora = 1 - np.asarray(Image.fromarray((dentro * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)[..., None] / 255
    final = prof[..., :2].astype(np.float32) * (1 - fora) + liso * fora
    final = np.where(dentro[..., None] > 0, prof[..., :2].astype(np.float32), final)
    return np.dstack([final, prof[..., 2:3].astype(np.float32)]).clip(0, 255).astype(np.uint8)


base = abre("pintura-base.png")
base_f = np.asarray(base, dtype=np.float32)
base.save(SAIDA + "base.webp", quality=88, method=6)
Image.fromarray(estende(np.asarray(abre("prof-base.png")))).save(SAIDA + "prof-base.webp", lossless=True, method=6)

pinturas = {c: abre(f"pintura-{c}.png") for c in ("decoracao", "itens")}
profs = {c: np.asarray(abre(f"prof-{c}.png")) for c in ("decoracao", "itens")}

ORDEM = ["decoracao", "ar_sala", "lavadora", "familia", "camas", "pet", "praia", "fechadura"]
saida = {
    "largura": L, "altura": A,
    "px_por_metro": cena["px_por_metro"], "sen_altura": cena["sen_altura"],
    "faixa_h_px": cena["faixa_h_px"], "faixa_d_px": cena["faixa_d_px"],
    "comodos": cena["comodos"], "camadas": [],
}
prova = base_f.copy()
for item in ORDEM:
    info = cena["itens"][item]
    pint = pinturas[info["cena"]]
    pint_f = np.asarray(pint, dtype=np.float32)
    m = np.asarray(abre(f"mascara-{item}.png", "L"), dtype=np.float32) / 255
    onde = Image.fromarray(((m > 0.02) * 255).astype(np.uint8))
    # região em que a pintura pôde mudar, com a borda desfeita para dentro
    regiao = onde.filter(ImageFilter.MaxFilter(2 * FOLGA + 1)).filter(ImageFilter.GaussianBlur(4))
    regiao = degrau(np.asarray(regiao, dtype=np.float32) / 255, 0.5, 0.95)
    # o que mudou de verdade em relação à base
    dif = Image.fromarray(np.abs(pint_f - base_f).max(axis=2).clip(0, 255).astype(np.uint8))
    dif = np.asarray(dif.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32)
    mudou = degrau(dif, 9, 26)
    mudou = np.asarray(Image.fromarray((mudou * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255
    # o miolo do bloco é do objeto mesmo quando a cor dele parece com a da base
    miolo = np.asarray(onde.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255
    alfa = np.maximum(mudou, miolo) * regiao
    ys, xs = np.nonzero(alfa > 0.01)
    x0, y0, x1, y1 = max(int(xs.min()) - 2, 0), max(int(ys.min()) - 2, 0), min(int(xs.max()) + 3, L), min(int(ys.max()) + 3, A)
    rec_a = alfa[y0:y1, x0:x1]
    rgba = np.dstack([pint_f[y0:y1, x0:x1] * (rec_a[..., None] > 0), rec_a * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(SAIDA + f"camada-{item}.webp", quality=90, alpha_quality=100, method=6)
    # profundidade do pedaço: vale onde o item está de fato (a máscara da geometria, com a borda levemente aberta)
    pm = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), dtype=np.float32)[y0:y1, x0:x1]
    pr = profs[info["cena"]][y0:y1, x0:x1]
    Image.fromarray(np.dstack([pr[..., 0], pr[..., 1], np.full_like(pr[..., 0], 255), pm.astype(np.uint8)]).astype(np.uint8), "RGBA").save(
        SAIDA + f"prof-{item}.webp", lossless=True, method=6)
    saida["camadas"].append({
        "id": item, "x": x0, "y": y0, "l": x1 - x0, "a": y1 - y0,
        "centro": [round(info["centro"][0], 1), round(info["centro"][1], 1)], "comodo": info["comodo"],
        # profundidade no centro do item (0 a 1), para a página pôr o marcador no lugar certo ao girar
        "prof": [round(float(np.median(profs[info["cena"]][..., 0][m > 0.5])) / 255, 4), round(float(np.median(profs[info["cena"]][..., 1][m > 0.5])) / 255, 4)],
    })
    a3 = alfa[..., None]
    prova = prova * (1 - a3) + pint_f * a3
    print(f"{item:10s} recorte {x1 - x0}x{y1 - y0}  cobre {alfa.mean() * 100:.2f}% da imagem  {os.path.getsize(SAIDA + f'camada-{item}.webp') // 1024} KB")

open(MANIFESTO, "w", encoding="utf-8", newline="\n").write(
    "// Gerado por motion/maquete/camadas.py: não edite à mão.\n"
    'import type { ManifestoMaquete } from "./maqueteCena";\n\n'
    "export const MANIFESTO = " + json.dumps(saida, ensure_ascii=False, indent=1) + " as unknown as ManifestoMaquete;\n"
)
Image.fromarray(prova.clip(0, 255).astype(np.uint8)).save(ARTE + "prova-completa.png")
print("base.webp", os.path.getsize(SAIDA + "base.webp") // 1024, "KB; prof-base.webp", os.path.getsize(SAIDA + "prof-base.webp") // 1024, "KB")
