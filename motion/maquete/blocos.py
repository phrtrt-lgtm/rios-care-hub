# Prepara os dois pedidos de edição da maquete: cola na pintura da base os blocos chapados das melhorias
# (tirados da planta) e monta a máscara que diz ao GPT Image onde ele pode repintar.
#
#   python -I motion/maquete/blocos.py <pasta da arte>
#
# Entra:  pintura-base.png, guia-decoracao.png, guia-itens.png, mascara-<item>.png   (de cena.py)
# Sai:    entrada-decoracao.png, entrada-itens.png          a pintura com os blocos no lugar
#         mascara-pedido-decoracao.png, mascara-pedido-itens.png   transparente = repinta; opaco = mantém
import sys

import numpy as np
from PIL import Image, ImageFilter

PASTA = sys.argv[1].rstrip("/\\") + "/"
FOLGA = 12  # px em volta de cada bloco, para a sombra e o contorno do objeto pintado

CENAS = {
    "decoracao": ["decoracao"],
    "itens": ["lavadora", "ar_sala", "familia", "camas", "pet", "praia", "fechadura"],
}

base = np.asarray(Image.open(PASTA + "pintura-base.png").convert("RGB"), dtype=np.float32)
for cena, itens in CENAS.items():
    guia = np.asarray(Image.open(PASTA + f"guia-{cena}.png").convert("RGB"), dtype=np.float32)
    m = np.zeros(base.shape[:2], dtype=np.float32)
    for item in itens:
        m = np.maximum(m, np.asarray(Image.open(PASTA + f"mascara-{item}.png").convert("L"), dtype=np.float32) / 255)
    entrada = base * (1 - m[..., None]) + guia * m[..., None]
    Image.fromarray(entrada.astype(np.uint8)).save(PASTA + f"entrada-{cena}.png")
    folga = Image.fromarray(((m > 0.02) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * FOLGA + 1))
    alfa = 255 - np.asarray(folga)
    rgba = np.dstack([np.zeros_like(alfa), np.zeros_like(alfa), np.zeros_like(alfa), alfa]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(PASTA + f"mascara-pedido-{cena}.png")
    print(cena, "repinta", round(float((alfa == 0).mean()) * 100, 1), "% da imagem")
