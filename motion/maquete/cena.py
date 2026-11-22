# Maquete do "Plano de melhorias" (página de resultados): a planta em blocos que guia a pintura.
#
#   python -I motion/maquete/cena.py <pasta de saída>
#
# Desenha o apartamento em caixas, numa vista de maquete (câmera sem perspectiva, de cima e de lado), e grava:
#   guia-base.png        o apartamento "padrão", sem as melhorias: é a planta exata que o GPT Image pinta
#   guia-decoracao.png   o mesmo, com a decoração
#   guia-itens.png       o mesmo, com as outras melhorias
#   prof-<cena>.png      profundidade de cada ponto (R = para o fundo no chão, G = ao longo da vista, B = tem maquete)
#   mascara-<item>.png   onde cada melhoria aparece (branco = o item, já descontado o que fica na frente dele)
#   cena.json            medidas para a página: caixa de cada item, foco de cada cômodo e as constantes da câmera
#
# A profundidade sai da mesma geometria da planta. É ela que deixa a pintura girar como uma maquete de verdade.
import json
import os
import sys

import numpy as np
from PIL import Image

SAIDA = sys.argv[1] if len(sys.argv) > 1 else "."
LARG, ALT = (int(v) for v in (sys.argv[2] if len(sys.argv) > 2 else "2048x1360").split("x"))
SS = int(os.environ.get("SS", "2"))  # desenha no dobro e reduz, para as bordas saírem lisas (SS=1 para rascunho)

TH = np.radians(30.0)  # giro da câmera: olha para o fundo e um pouco para a esquerda
PH = np.radians(35.0)  # altura da câmera
ST, CT, SP, CP = np.sin(TH), np.cos(TH), np.sin(PH), np.cos(PH)

CAIXAS = []  # (x0, x1, y0, y1, z0, z1, cor, grupo)


def cx(x0, x1, y0, y1, z0, z1, cor, grupo="base"):
    CAIXAS.append((x0, x1, y0, y1, z0, z1, cor, grupo))


# ---------------------------------------------------------------- cores (chapadas, como no guia do jogo)
PAREDE = (240, 229, 210)
PAREDE_TOPO = (255, 247, 233)
LAJE = (196, 178, 156)
MADEIRA = (150, 104, 66)
MADEIRA_CLARA = (201, 160, 112)
PISO_QUARTO = (206, 167, 120)
PISO_SALA = (228, 214, 190)
PISO_COZINHA = (214, 208, 196)
PISO_VARANDA = (176, 132, 92)
BRANCO = (248, 246, 240)
CINZA = (176, 178, 182)
ESCURO = (52, 58, 70)
AZUL = (58, 110, 160)
AZUL_CLARO = (150, 192, 222)
TERRACOTA = (196, 104, 68)
VERDE = (76, 140, 84)
AMARELO = (238, 196, 92)
INOX = (198, 204, 210)

# ---------------------------------------------------------------- casca: laje, pisos e paredes
LX, LY, HP = 11.6, 7.0, 2.7
cx(-0.12, LX, 0, LY + 0.12, -0.28, 0, LAJE)
# pisos (uma lâmina de 1 cm por cômodo, para a cor mudar)
cx(0, 3.5, 3.6, LY, 0, 0.01, PISO_QUARTO)  # quarto 1
cx(3.5, 6.7, 3.6, LY, 0, 0.01, PISO_QUARTO)  # quarto 2
cx(6.7, 7.8, 3.6, LY, 0, 0.01, PISO_SALA)  # entrada
cx(7.8, LX, 3.6, LY, 0, 0.01, PISO_COZINHA)  # cozinha e área de serviço
cx(0, LX, 1.3, 3.6, 0, 0.01, PISO_SALA)  # sala e jantar
cx(0, LX, 0, 1.3, 0, 0.01, PISO_VARANDA)  # varanda
# paredes inteiras: fundo e esquerda
cx(-0.12, LX, LY, LY + 0.12, 0, HP, PAREDE)
cx(-0.12, 0, 1.3, LY + 0.12, 0, HP, PAREDE)
cx(-0.12, 0, 0, 1.3, 0, 1.0, PAREDE)  # mureta da varanda, à esquerda
# divisórias cortadas a 1 m (o topo mais claro mostra o corte)
for xd, y0 in ((3.5, 3.6), (6.7, 3.6), (7.8, 4.4), (10.2, 5.1)):
    cx(xd - 0.06, xd + 0.06, y0, LY, 0, 1.0, PAREDE)
    cx(xd - 0.06, xd + 0.06, y0, LY, 1.0, 1.02, PAREDE_TOPO)
# soleiras baixas entre os quartos e a sala (com o vão da porta)
cx(0, 2.45, 3.6, 3.7, 0, 0.3, PAREDE)
cx(3.56, 5.65, 3.6, 3.7, 0, 0.3, PAREDE)
# guarda-corpo de vidro da varanda: só o corrimão e os montantes
cx(0, LX, 0, 0.05, 0.96, 1.0, INOX)
for xm in (0.02, 2.9, 5.8, 8.7, LX - 0.05):
    cx(xm, xm + 0.04, 0, 0.05, 0, 0.96, INOX)
cx(LX - 0.05, LX, 0, 1.3, 0.96, 1.0, INOX)

# ---------------------------------------------------------------- quarto 1 (casal)
cx(1.3, 2.9, 4.9, 6.9, 0, 0.3, MADEIRA)  # cama
cx(1.3, 2.9, 4.9, 6.88, 0.3, 0.56, BRANCO)  # colchão e lençol
cx(1.3, 2.9, 4.9, 5.9, 0.56, 0.6, AZUL_CLARO)  # colcha lisa
cx(1.2, 3.0, 6.9, 7.0, 0, 1.15, MADEIRA_CLARA)  # cabeceira
cx(1.45, 2.0, 6.45, 6.82, 0.56, 0.7, BRANCO)  # travesseiros
cx(2.2, 2.75, 6.45, 6.82, 0.56, 0.7, BRANCO)
cx(0.78, 1.22, 6.5, 6.95, 0, 0.5, MADEIRA_CLARA)  # criados-mudos
cx(2.98, 3.4, 6.5, 6.95, 0, 0.5, MADEIRA_CLARA)
cx(0.9, 1.1, 6.62, 6.82, 0.5, 0.85, AMARELO)  # abajures
cx(3.08, 3.28, 6.62, 6.82, 0.5, 0.85, AMARELO)
cx(0, 0.6, 5.55, 6.95, 0, 2.1, MADEIRA_CLARA)  # guarda-roupa
cx(0, 0.04, 4.0, 5.2, 1.0, 2.1, AZUL_CLARO)  # janela na parede da esquerda
cx(1.65, 2.55, 6.78, 7.0, 2.2, 2.48, BRANCO)  # ar-condicionado

# ---------------------------------------------------------------- quarto 2 (duas camas de solteiro)
for xa in (3.75, 5.6):
    cx(xa, xa + 0.9, 4.95, 6.9, 0, 0.3, MADEIRA)
    cx(xa, xa + 0.9, 4.95, 6.88, 0.3, 0.54, BRANCO)
    cx(xa, xa + 0.9, 4.95, 5.85, 0.54, 0.58, AZUL_CLARO)
    cx(xa - 0.05, xa + 0.95, 6.9, 7.0, 0, 1.05, MADEIRA_CLARA)
    cx(xa + 0.17, xa + 0.73, 6.45, 6.8, 0.54, 0.68, BRANCO)
cx(4.9, 5.35, 6.5, 6.95, 0, 0.5, MADEIRA_CLARA)  # criado-mudo entre as camas
cx(5.03, 5.23, 6.62, 6.82, 0.5, 0.85, AMARELO)
cx(4.68, 5.58, 6.78, 7.0, 2.2, 2.48, BRANCO)  # ar-condicionado

# ---------------------------------------------------------------- entrada
cx(6.82, 7.62, 6.95, 7.0, 0, 2.1, MADEIRA)  # porta de entrada
cx(6.9, 7.55, 6.15, 6.7, 0.01, 0.025, TERRACOTA)  # capacho

# ---------------------------------------------------------------- cozinha
cx(8.0, 8.7, 6.3, 7.0, 0, 1.8, INOX)  # geladeira
cx(8.7, 10.14, 6.4, 7.0, 0, 0.9, BRANCO)  # bancada com armários
cx(8.7, 10.14, 6.38, 7.0, 0.9, 0.94, ESCURO)  # tampo
cx(8.8, 9.36, 6.5, 6.9, 0.94, 0.96, CINZA)  # fogão
cx(8.8, 9.36, 6.7, 7.0, 1.6, 1.9, INOX)  # coifa
cx(9.5, 10.02, 6.52, 6.88, 0.94, 0.955, INOX)  # pia
cx(9.46, 10.06, 6.97, 7.0, 1.15, 1.95, AZUL_CLARO)  # janela sobre a pia
cx(8.0, 10.0, 3.5, 4.0, 0, 1.0, BRANCO)  # bancada americana
cx(7.95, 10.05, 3.45, 4.05, 1.0, 1.05, MADEIRA_CLARA)
cx(8.15, 8.45, 3.6, 3.9, 1.05, 1.35, ESCURO)  # cafeteira
cx(8.6, 8.95, 3.58, 3.92, 1.05, 1.38, ESCURO)  # air fryer
for xb in (8.35, 9.3):  # banquetas
    cx(xb, xb + 0.36, 3.0, 3.36, 0, 0.7, MADEIRA)

# ---------------------------------------------------------------- área de serviço
cx(10.92, 11.52, 6.4, 7.0, 0, 0.88, BRANCO)  # tanque
cx(10.3, 11.52, 6.75, 7.0, 1.55, 1.6, MADEIRA_CLARA)  # prateleira
cx(11.0, 11.4, 6.78, 6.98, 1.6, 1.85, AZUL)  # produtos na prateleira

# ---------------------------------------------------------------- sala
cx(0, 0.42, 2.0, 3.4, 0, 0.5, MADEIRA_CLARA)  # rack
cx(0, 0.05, 2.1, 3.3, 1.0, 1.72, ESCURO)  # TV na parede
cx(1.6, 3.9, 2.75, 3.55, 0, 0.42, AZUL)  # sofá
cx(1.6, 3.9, 3.35, 3.55, 0.42, 0.86, AZUL)
cx(1.6, 1.8, 2.75, 3.55, 0.42, 0.62, AZUL)
cx(3.7, 3.9, 2.75, 3.55, 0.42, 0.62, AZUL)
cx(3.08, 3.9, 1.85, 2.75, 0, 0.42, AZUL)  # chaise
cx(1.9, 2.8, 1.75, 2.35, 0, 0.36, MADEIRA)  # mesa de centro

# ---------------------------------------------------------------- jantar
cx(6.7, 8.3, 1.75, 2.65, 0.7, 0.76, MADEIRA)  # mesa
for (xp, yp) in ((6.78, 1.83), (8.14, 1.83), (6.78, 2.49), (8.14, 2.49)):
    cx(xp, xp + 0.08, yp, yp + 0.08, 0, 0.7, MADEIRA)
for xc in (6.92, 7.66):  # cadeiras
    cx(xc, xc + 0.42, 2.75, 3.17, 0, 0.45, MADEIRA_CLARA)
    cx(xc, xc + 0.42, 3.11, 3.17, 0.45, 0.9, MADEIRA_CLARA)
    cx(xc, xc + 0.42, 1.25 + 0.05, 1.67 + 0.05, 0, 0.45, MADEIRA_CLARA)
    cx(xc, xc + 0.42, 1.3, 1.36, 0.45, 0.9, MADEIRA_CLARA)
cx(10.25, 11.05, 1.75, 2.55, 0, 0.42, AZUL)  # poltrona
cx(10.85, 11.05, 1.75, 2.55, 0.42, 0.86, AZUL)

# ---------------------------------------------------------------- varanda
cx(1.0, 2.9, 0.35, 1.0, 0.2, 0.32, MADEIRA_CLARA)  # espreguiçadeira
cx(1.0, 1.6, 0.35, 1.0, 0.32, 0.62, MADEIRA_CLARA)
cx(4.3, 5.0, 0.3, 1.0, 0.66, 0.7, BRANCO)  # mesinha
cx(4.6, 4.7, 0.6, 0.7, 0, 0.66, CINZA)
cx(3.7, 4.12, 0.44, 0.86, 0, 0.44, MADEIRA_CLARA)  # duas cadeiras
cx(5.18, 5.6, 0.44, 0.86, 0, 0.44, MADEIRA_CLARA)

# ================================================================ melhorias (cada grupo vira uma camada)
# lava e seca, na área de serviço
cx(10.28, 10.88, 6.36, 7.0, 0, 0.87, BRANCO, "lavadora")
cx(10.36, 10.8, 6.34, 6.36, 0.2, 0.64, ESCURO, "lavadora")
# ar-condicionado na sala
cx(0, 0.24, 2.25, 3.15, 2.2, 2.48, BRANCO, "ar_sala")
# decoração de curadoria: quadros, tapete, almofadas, plantas, luminária, mantas
cx(1.55, 2.65, 6.97, 7.0, 1.3, 1.98, TERRACOTA, "decoracao")  # quadro do casal
cx(3.88, 4.52, 6.97, 7.0, 1.3, 1.9, TERRACOTA, "decoracao")  # quadros das camas de solteiro
cx(5.73, 6.37, 6.97, 7.0, 1.3, 1.9, AZUL, "decoracao")
cx(1.3, 2.9, 4.9, 5.4, 0.6, 0.64, TERRACOTA, "decoracao")  # peseira do casal
cx(1.9, 2.3, 6.25, 6.5, 0.6, 0.78, TERRACOTA, "decoracao")  # almofada do casal
cx(3.75, 4.65, 4.95, 5.35, 0.58, 0.62, TERRACOTA, "decoracao")  # peseiras de solteiro
cx(5.6, 6.5, 4.95, 5.35, 0.58, 0.62, TERRACOTA, "decoracao")
cx(1.5, 4.35, 1.5, 3.05, 0.01, 0.03, TERRACOTA, "decoracao")  # tapete da sala
cx(1.95, 2.3, 3.0, 3.3, 0.42, 0.72, AMARELO, "decoracao")  # almofadas do sofá
cx(2.6, 2.95, 3.0, 3.3, 0.42, 0.72, TERRACOTA, "decoracao")
cx(3.25, 3.6, 3.0, 3.3, 0.42, 0.72, AMARELO, "decoracao")
cx(4.05, 4.13, 3.25, 3.33, 0, 1.45, ESCURO, "decoracao")  # luminária de piso
cx(3.93, 4.25, 3.13, 3.45, 1.45, 1.75, AMARELO, "decoracao")
cx(5.3, 5.7, 1.6, 2.0, 0, 0.45, TERRACOTA, "decoracao")  # vaso grande da sala
cx(5.15, 5.85, 1.45, 2.15, 0.45, 1.5, VERDE, "decoracao")
cx(10.75, 11.1, 2.85, 3.2, 0, 0.4, TERRACOTA, "decoracao")  # vaso do jantar
cx(10.6, 11.25, 2.7, 3.35, 0.4, 1.3, VERDE, "decoracao")
cx(7.2, 7.8, 2.05, 2.35, 0.76, 0.95, VERDE, "decoracao")  # arranjo na mesa
cx(6.4, 8.2, 0.1, 0.42, 0, 0.42, TERRACOTA, "decoracao")  # jardineira da varanda
cx(6.4, 8.2, 0.08, 0.44, 0.42, 0.85, VERDE, "decoracao")
# kit família: berço no quarto do casal e cadeirão na mesa
cx(0.12, 0.82, 3.85, 5.05, 0, 0.3, BRANCO, "familia")
cx(0.12, 0.82, 3.85, 5.05, 0.3, 0.4, AZUL_CLARO, "familia")
cx(0.12, 0.16, 3.85, 5.05, 0.3, 0.95, BRANCO, "familia")
cx(0.78, 0.82, 3.85, 5.05, 0.3, 0.95, BRANCO, "familia")
cx(0.12, 0.82, 3.85, 3.89, 0.3, 0.95, BRANCO, "familia")
cx(0.12, 0.82, 5.01, 5.05, 0.3, 0.95, BRANCO, "familia")
cx(6.08, 6.53, 1.98, 2.43, 0, 0.55, BRANCO, "familia")  # cadeirão
cx(6.08, 6.53, 1.98, 2.43, 0.55, 0.62, AMARELO, "familia")
cx(6.08, 6.14, 1.98, 2.43, 0.62, 1.0, BRANCO, "familia")
# mais lugares para dormir: cama auxiliar puxada entre as duas de solteiro
cx(4.68, 5.55, 4.45, 6.38, 0, 0.14, MADEIRA, "camas")
cx(4.68, 5.55, 4.45, 6.36, 0.14, 0.32, BRANCO, "camas")
cx(4.68, 5.55, 4.45, 5.2, 0.32, 0.35, AZUL_CLARO, "camas")
cx(4.84, 5.39, 5.95, 6.28, 0.32, 0.44, BRANCO, "camas")
# pet: caminha e potes no canto da sala
cx(0.14, 0.92, 1.38, 1.96, 0, 0.16, TERRACOTA, "pet")
cx(0.24, 0.82, 1.48, 1.86, 0.16, 0.2, PAREDE_TOPO, "pet")
cx(1.02, 1.2, 1.42, 1.6, 0, 0.08, INOX, "pet")
cx(1.26, 1.44, 1.42, 1.6, 0, 0.08, INOX, "pet")
# kit praia, na ponta da varanda
cx(9.3, 9.42, 0.3, 0.9, 0, 0.92, AZUL, "praia")  # cadeiras dobradas, em pé
cx(9.5, 9.62, 0.3, 0.9, 0, 0.92, AMARELO, "praia")
cx(9.82, 9.94, 0.52, 0.64, 0, 1.6, TERRACOTA, "praia")  # guarda-sol fechado
cx(10.1, 10.62, 0.34, 0.72, 0, 0.4, AZUL, "praia")  # caixa térmica
cx(10.1, 10.62, 0.34, 0.72, 0.4, 0.46, BRANCO, "praia")
cx(10.8, 11.45, 0.28, 0.82, 0.14, 0.6, AMARELO, "praia")  # carrinho de praia
cx(10.8, 10.94, 0.2, 0.28, 0, 0.28, ESCURO, "praia")
cx(11.3, 11.44, 0.2, 0.28, 0, 0.28, ESCURO, "praia")
# fechadura digital, na porta de entrada
cx(6.9, 7.02, 6.925, 6.95, 0.9, 1.22, ESCURO, "fechadura")
cx(6.93, 6.99, 6.92, 6.925, 1.08, 1.18, AZUL_CLARO, "fechadura")

GRUPOS = ["base", "lavadora", "ar_sala", "decoracao", "familia", "camas", "pet", "praia", "fechadura"]

# cômodos: a caixa que a câmera enquadra ao focar (x0, x1, y0, y1, altura)
COMODOS = {
    "quarto1": (0, 3.5, 3.6, 7.0, 2.7),
    "quarto2": (3.5, 6.7, 3.6, 7.0, 2.7),
    "entrada": (6.5, 8.0, 4.6, 7.0, 2.4),
    "cozinha": (7.8, 10.2, 3.3, 7.0, 2.2),
    "servico": (9.9, 11.6, 5.0, 7.0, 2.0),
    "sala": (0, 5.6, 1.3, 3.6, 2.7),
    "jantar": (6.2, 11.6, 1.3, 3.6, 1.6),
    "varanda": (0, 11.6, 0, 1.3, 1.6),
}
ITEM_COMODO = {
    "lavadora": "servico", "ar_sala": "sala", "decoracao": None, "familia": "quarto1", "camas": "quarto2",
    "pet": "sala", "praia": "varanda", "fechadura": "entrada",
}


def projeta(p):
    """(x, y, z) -> (sx, sy, h, d): tela para a direita, tela para cima, fundo no chão, fundo na vista."""
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    h = -x * ST + y * CT
    return x * CT + y * ST, z * CP + h * SP, h, h * CP - z * SP


# ---------------------------------------------------------------- enquadramento
cantos = []
for (x0, x1, y0, y1, z0, z1, _c, _g) in CAIXAS:
    for x in (x0, x1):
        for y in (y0, y1):
            for z in (z0, z1):
                cantos.append((x, y, z))
cantos = np.array(cantos, dtype=np.float64)
sx, sy, hh, dd = projeta(cantos)
MARG_X, MARG_TOPO, MARG_BASE = 0.045, 0.06, 0.075
escala = min(LARG * (1 - 2 * MARG_X) / (sx.max() - sx.min()), ALT * (1 - MARG_TOPO - MARG_BASE) / (sy.max() - sy.min()))
off_x = (LARG - (sx.max() - sx.min()) * escala) / 2 - sx.min() * escala
off_y = ALT * (1 - MARG_BASE) + sy.min() * escala - (ALT * (1 - MARG_TOPO - MARG_BASE) - (sy.max() - sy.min()) * escala) / 2
H0, H1, D0, D1 = hh.min(), hh.max(), dd.min(), dd.max()


def tela(p):
    sx_, sy_, h_, d_ = projeta(np.asarray(p, dtype=np.float64))
    return sx_ * escala + off_x, off_y - sy_ * escala, h_, d_


def desenha(grupos_ativos):
    """Devolve cor (H, W, 3), h, d e o índice do grupo de cada ponto, no tamanho final."""
    w, hpx = LARG * SS, ALT * SS
    cor = np.zeros((hpx, w, 3), dtype=np.float32)
    perto = np.full((hpx, w), np.inf, dtype=np.float32)  # d do ponto mais próximo
    mapa_h = np.zeros((hpx, w), dtype=np.float32)
    quem = np.full((hpx, w), -1, dtype=np.int16)
    for (x0, x1, y0, y1, z0, z1, c, g) in CAIXAS:
        if g not in grupos_ativos:
            continue
        gi = GRUPOS.index(g)
        faces = (
            (((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), 1.0),  # topo
            (((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)), 0.84),  # frente
            (((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)), 0.7),  # lado direito
        )
        for quad, luz in faces:
            px, py, fh, fd = tela(np.array(quad))
            px, py = px * SS, py * SS
            ax0, ax1 = int(np.floor(px.min())), int(np.ceil(px.max())) + 1
            ay0, ay1 = int(np.floor(py.min())), int(np.ceil(py.max())) + 1
            ax0, ay0, ax1, ay1 = max(ax0, 0), max(ay0, 0), min(ax1, w), min(ay1, hpx)
            if ax1 <= ax0 or ay1 <= ay0:
                continue
            gx, gy = np.meshgrid(np.arange(ax0, ax1) + 0.5, np.arange(ay0, ay1) + 0.5)
            dentro = np.ones(gx.shape, dtype=bool)
            sinal = 0
            for i in range(4):
                xa, ya, xb, yb = px[i], py[i], px[(i + 1) % 4], py[(i + 1) % 4]
                lado = (xb - xa) * (gy - ya) - (yb - ya) * (gx - xa)
                if sinal == 0:
                    sinal = 1 if lado[lado.shape[0] // 2, lado.shape[1] // 2] >= 0 else -1
                    # o sinal certo é o do centro do quadrilátero
                    cxm, cym = px.mean(), py.mean()
                    sinal = 1 if (xb - xa) * (cym - ya) - (yb - ya) * (cxm - xa) >= 0 else -1
                dentro &= (lado * sinal) >= -1e-6
            if not dentro.any():
                continue
            # h e d são planos na tela: resolve pelos três primeiros vértices
            A = np.array([[px[0], py[0], 1], [px[1], py[1], 1], [px[2], py[2], 1]])
            try:
                ch = np.linalg.solve(A, fh[:3])
                cd = np.linalg.solve(A, fd[:3])
            except np.linalg.LinAlgError:
                continue
            fd_px = (cd[0] * gx + cd[1] * gy + cd[2]).astype(np.float32)
            fh_px = (ch[0] * gx + ch[1] * gy + ch[2]).astype(np.float32)
            reg_p = perto[ay0:ay1, ax0:ax1]
            ganha = dentro & (fd_px < reg_p - 1e-4)
            reg_p[ganha] = fd_px[ganha]
            mapa_h[ay0:ay1, ax0:ax1][ganha] = fh_px[ganha]
            quem[ay0:ay1, ax0:ax1][ganha] = gi
            cor[ay0:ay1, ax0:ax1][ganha] = np.array(c, dtype=np.float32) * luz
    return cor, mapa_h, perto, quem


def reduz(a):
    """Média 2x2 (ou SSxSS)."""
    hpx, w = a.shape[0] // SS, a.shape[1] // SS
    return a.reshape(hpx, SS, w, SS, *a.shape[2:]).mean(axis=(1, 3))


FUNDO = np.array((22, 44, 74), dtype=np.float32)  # azul-noite da marca


def grava(nome, grupos_ativos):
    cor, mh, md, quem = desenha(grupos_ativos)
    vazio = quem < 0
    cor[vazio] = FUNDO
    Image.fromarray(np.clip(reduz(cor), 0, 255).astype(np.uint8)).save(os.path.join(SAIDA, f"guia-{nome}.png"))
    # profundidade: 0 = mais perto, 1 = mais longe; o vazio fica no fundo
    nh = np.where(vazio, 1.0, (mh - H0) / (H1 - H0))
    nd = np.where(vazio, 1.0, (md - D0) / (D1 - D0))
    prof = np.stack([reduz(nh), reduz(nd), reduz((~vazio).astype(np.float32))], axis=-1)
    Image.fromarray(np.clip(prof * 255, 0, 255).astype(np.uint8)).save(os.path.join(SAIDA, f"prof-{nome}.png"))
    return quem


os.makedirs(SAIDA, exist_ok=True)
# Três cenas. A decoração é pintada separada das outras melhorias porque é a única que fica atrás de outra
# (a manta da cama de solteiro atrás da cama auxiliar): assim a camada dela sai inteira.
grava("base", {"base"})
quem_decor = grava("decoracao", {"base", "decoracao"})
quem_itens = grava("itens", set(GRUPOS) - {"decoracao"})

itens = {}
for g in GRUPOS[1:]:
    quem = quem_decor if g == "decoracao" else quem_itens
    m = reduz((quem == GRUPOS.index(g)).astype(np.float32))
    Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(SAIDA, f"mascara-{g}.png"))
    ys, xs = np.nonzero(m > 0.05)
    itens[g] = {
        "cena": "decoracao" if g == "decoracao" else "itens",
        "caixa": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "centro": [float(np.average(xs, weights=m[ys, xs])), float(np.average(ys, weights=m[ys, xs]))],
        "comodo": ITEM_COMODO[g],
    }

if os.environ.get("CONFERIR"):
    # fora a decoração, nenhuma melhoria pode cobrir outra na tela: cada uma vira uma camada solta
    silhuetas = {}
    for g in GRUPOS[1:]:
        _c, _h, _d, q = desenha({g})
        silhuetas[g] = reduz((q >= 0).astype(np.float32)) > 0.02
    for i, a in enumerate(GRUPOS[1:]):
        for b in GRUPOS[i + 2:]:
            cruza = int((silhuetas[a] & silhuetas[b]).sum())
            if cruza:
                print(f"ATENCAO: {a} e {b} se cruzam na tela em {cruza} pontos")

comodos = {}
for nome, (x0, x1, y0, y1, alt) in COMODOS.items():
    pts = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (0, alt)])
    px, py, fh, fd = tela(pts)
    comodos[nome] = {
        "caixa": [float(px.min()), float(py.min()), float(px.max()), float(py.max())],
        "h": float((fh.mean() - H0) / (H1 - H0)),
        "d": float((fd.mean() - D0) / (D1 - D0)),
    }

json.dump({
    "largura": LARG, "altura": ALT,
    "px_por_metro": float(escala),
    "sen_altura": float(SP),
    # quanto um ponto anda na tela (em px) por radiano de giro: h e d em [0, 1] voltam a metros com estas faixas
    "faixa_h_px": float((H1 - H0) * escala), "faixa_d_px": float((D1 - D0) * escala),
    "itens": itens, "comodos": comodos,
}, open(os.path.join(SAIDA, "cena.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", LARG, ALT, "px/m", round(float(escala), 1), "caixas", len(CAIXAS))
