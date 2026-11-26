# Maquete do "Plano de melhorias" (página de resultados): a planta em blocos que guia a pintura.
#
#   python -I motion/maquete/cena.py <pasta de saída> [2048x1360] [modelo = apto2]
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


ORIGEM = [0.0]  # deslocamento em x das caixas seguintes (plantas com dois blocos lado a lado)
NIVEL = [0.0]  # altura do piso em que as caixas seguintes entram (nivel(1.3) = andar de cima, erguido)


def nivel(z):
    NIVEL[0] = z


def cx(x0, x1, y0, y1, z0, z1, cor, grupo="base"):
    CAIXAS.append((x0 + ORIGEM[0], x1 + ORIGEM[0], y0, y1, z0 + NIVEL[0], z1 + NIVEL[0], cor, grupo))


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

# ---------------------------------------------------------------- móveis prontos
# Usados pelas plantas em modelos/. Convenção: x cresce para a direita, y para o fundo; "yw" é a parede
# atrás do móvel (a do fundo do cômodo) e "xw" a parede da esquerda. O que é melhoria leva o nome do grupo.
PISO_GRAMA = (120, 160, 96)
PISO_PEDRA = (190, 182, 168)
HP = 2.7


def laje(x0, x1, y0, y1):
    cx(x0 - 0.12, x1, y0, y1 + 0.12, -0.28, 0, LAJE)


def piso(x0, x1, y0, y1, cor):
    cx(x0, x1, y0, y1, 0, 0.01, cor)


def parede_fundo(x0, x1, yw, alt=HP):
    cx(x0 - 0.12, x1, yw, yw + 0.12, 0, alt, PAREDE)


def parede_esq(xw, y0, y1, alt=HP):
    cx(xw - 0.12, xw, y0, y1 + 0.12, 0, alt, PAREDE)


def divisoria(x, y0, y1, alt=1.0):
    """Parede entre dois cômodos, cortada a 1 m para a vista entrar."""
    cx(x - 0.06, x + 0.06, y0, y1, 0, alt, PAREDE)
    cx(x - 0.06, x + 0.06, y0, y1, alt, alt + 0.02, PAREDE_TOPO)


def soleira(x0, x1, y):
    cx(x0, x1, y, y + 0.1, 0, 0.3, PAREDE)


def guarda_corpo(x0, x1, y0, y1):
    """Vidro com corrimão na frente (y0) e na direita (x1)."""
    cx(x0, x1, y0, y0 + 0.05, 0.96, 1.0, INOX)
    n = max(2, int(round((x1 - x0) / 2.9)) + 1)
    for i in range(n):
        xm = x0 + 0.02 + (x1 - x0 - 0.09) * i / (n - 1)
        cx(xm, xm + 0.04, y0, y0 + 0.05, 0, 0.96, INOX)
    cx(x1 - 0.05, x1, y0, y1, 0.96, 1.0, INOX)


def mureta(x0, x1, y0, y1, alt=0.9):
    """Muro baixo de quintal, na frente e na direita."""
    cx(x0, x1, y0, y0 + 0.12, 0, alt, PAREDE)
    cx(x1 - 0.12, x1, y0, y1, 0, alt, PAREDE)


def cama_casal(x, yw, peseira=True):
    cx(x, x + 1.6, yw - 2.1, yw - 0.1, 0, 0.3, MADEIRA)
    cx(x, x + 1.6, yw - 2.1, yw - 0.12, 0.3, 0.56, BRANCO)
    cx(x, x + 1.6, yw - 2.1, yw - 1.1, 0.56, 0.6, AZUL_CLARO)
    cx(x - 0.1, x + 1.7, yw - 0.1, yw, 0, 1.15, MADEIRA_CLARA)
    cx(x + 0.15, x + 0.7, yw - 0.55, yw - 0.18, 0.56, 0.7, BRANCO)
    cx(x + 0.9, x + 1.45, yw - 0.55, yw - 0.18, 0.56, 0.7, BRANCO)
    if peseira:
        cx(x, x + 1.6, yw - 2.1, yw - 1.6, 0.6, 0.64, TERRACOTA, "decoracao")
        cx(x + 0.6, x + 1.0, yw - 0.75, yw - 0.5, 0.6, 0.78, TERRACOTA, "decoracao")


def cama_solteiro(x, yw, peseira=True):
    cx(x, x + 0.9, yw - 2.05, yw - 0.1, 0, 0.3, MADEIRA)
    cx(x, x + 0.9, yw - 2.05, yw - 0.12, 0.3, 0.54, BRANCO)
    cx(x, x + 0.9, yw - 2.05, yw - 1.15, 0.54, 0.58, AZUL_CLARO)
    cx(x - 0.05, x + 0.95, yw - 0.1, yw, 0, 1.05, MADEIRA_CLARA)
    cx(x + 0.17, x + 0.73, yw - 0.55, yw - 0.2, 0.54, 0.68, BRANCO)
    if peseira:
        cx(x, x + 0.9, yw - 2.05, yw - 1.65, 0.58, 0.62, TERRACOTA, "decoracao")


def criado(x, yw):
    cx(x, x + 0.44, yw - 0.5, yw - 0.05, 0, 0.5, MADEIRA_CLARA)
    cx(x + 0.12, x + 0.32, yw - 0.38, yw - 0.18, 0.5, 0.85, AMARELO)


def armario_esq(xw, y0, y1):
    cx(xw, xw + 0.6, y0, y1, 0, 2.1, MADEIRA_CLARA)


def armario_fundo(x0, x1, yw):
    cx(x0, x1, yw - 0.6, yw - 0.02, 0, 2.1, MADEIRA_CLARA)


def janela_esq(xw, y0, y1):
    cx(xw, xw + 0.04, y0, y1, 1.0, 2.1, AZUL_CLARO)


def janela_fundo(x0, x1, yw):
    cx(x0, x1, yw - 0.03, yw, 1.15, 1.95, AZUL_CLARO)


def ar_fundo(x, yw, grupo="base"):
    cx(x, x + 0.9, yw - 0.22, yw, 2.2, 2.48, BRANCO, grupo)


def ar_esq(xw, y, grupo="base"):
    cx(xw, xw + 0.24, y, y + 0.9, 2.2, 2.48, BRANCO, grupo)


def quadro(x0, x1, yw, cor=TERRACOTA):
    cx(x0, x1, yw - 0.03, yw, 1.3, 1.95, cor, "decoracao")


def tv_esq(xw, y0):
    """Rack baixo e TV na parede da esquerda, a partir de y0 (1,4 m de comprido)."""
    cx(xw, xw + 0.42, y0, y0 + 1.4, 0, 0.5, MADEIRA_CLARA)
    cx(xw, xw + 0.05, y0 + 0.1, y0 + 1.3, 1.0, 1.72, ESCURO)


def sofa(x, y, almofadas=True):
    """Sofá de três lugares com chaise, de frente para a câmera; (x, y) é o canto da frente à esquerda do assento."""
    cx(x, x + 2.3, y, y + 0.8, 0, 0.42, AZUL)
    cx(x, x + 2.3, y + 0.6, y + 0.8, 0.42, 0.86, AZUL)
    cx(x, x + 0.2, y, y + 0.8, 0.42, 0.62, AZUL)
    cx(x + 2.1, x + 2.3, y, y + 0.8, 0.42, 0.62, AZUL)
    cx(x + 1.48, x + 2.3, y - 0.9, y, 0, 0.42, AZUL)
    cx(x + 0.3, x + 1.2, y - 1.0, y - 0.4, 0, 0.36, MADEIRA)  # mesa de centro
    if almofadas:
        for i, cor in enumerate((AMARELO, TERRACOTA, AMARELO)):
            cx(x + 0.35 + i * 0.65, x + 0.7 + i * 0.65, y + 0.25, y + 0.55, 0.42, 0.72, cor, "decoracao")


def tapete(x0, x1, y0, y1):
    cx(x0, x1, y0, y1, 0.01, 0.03, TERRACOTA, "decoracao")


def luminaria(x, y):
    cx(x, x + 0.08, y, y + 0.08, 0, 1.45, ESCURO, "decoracao")
    cx(x - 0.12, x + 0.2, y - 0.12, y + 0.2, 1.45, 1.75, AMARELO, "decoracao")


def planta(x, y, alt=1.4):
    cx(x + 0.15, x + 0.55, y + 0.15, y + 0.55, 0, 0.45, TERRACOTA, "decoracao")
    cx(x, x + 0.7, y, y + 0.7, 0.45, alt, VERDE, "decoracao")


def jardineira(x0, x1, y):
    cx(x0, x1, y, y + 0.32, 0, 0.42, TERRACOTA, "decoracao")
    cx(x0, x1, y - 0.02, y + 0.34, 0.42, 0.85, VERDE, "decoracao")


def mesa_jantar(x, y, lugares=4, arranjo=True):
    """Mesa com cadeiras atrás e na frente; (x, y) é o canto da frente à esquerda do tampo."""
    comp = 1.6 if lugares <= 4 else 2.3
    cx(x, x + comp, y, y + 0.9, 0.7, 0.76, MADEIRA)
    for xp in (x + 0.08, x + comp - 0.16):
        for yp in (y + 0.08, y + 0.74):
            cx(xp, xp + 0.08, yp, yp + 0.08, 0, 0.7, MADEIRA)
    n = 2 if lugares <= 4 else 3
    for i in range(n):
        xc = x + 0.22 + i * (comp - 0.86) / max(1, n - 1)
        cx(xc, xc + 0.42, y + 1.0, y + 1.42, 0, 0.45, MADEIRA_CLARA)
        cx(xc, xc + 0.42, y + 1.36, y + 1.42, 0.45, 0.9, MADEIRA_CLARA)
        cx(xc, xc + 0.42, y - 0.4, y + 0.02, 0, 0.45, MADEIRA_CLARA)
        cx(xc, xc + 0.42, y - 0.45, y - 0.39, 0.45, 0.9, MADEIRA_CLARA)
    if arranjo:
        cx(x + comp / 2 - 0.3, x + comp / 2 + 0.3, y + 0.3, y + 0.6, 0.76, 0.95, VERDE, "decoracao")


def cadeirao(x, y):
    cx(x, x + 0.45, y, y + 0.45, 0, 0.55, BRANCO, "familia")
    cx(x, x + 0.45, y, y + 0.45, 0.55, 0.62, AMARELO, "familia")
    cx(x, x + 0.06, y, y + 0.45, 0.62, 1.0, BRANCO, "familia")


def berco(x, y):
    """Berço de 0,7 x 1,2 m; (x, y) é o canto da frente à esquerda."""
    cx(x, x + 0.7, y, y + 1.2, 0, 0.3, BRANCO, "familia")
    cx(x, x + 0.7, y, y + 1.2, 0.3, 0.4, AZUL_CLARO, "familia")
    cx(x, x + 0.04, y, y + 1.2, 0.3, 0.95, BRANCO, "familia")
    cx(x + 0.66, x + 0.7, y, y + 1.2, 0.3, 0.95, BRANCO, "familia")
    cx(x, x + 0.7, y, y + 0.04, 0.3, 0.95, BRANCO, "familia")
    cx(x, x + 0.7, y + 1.16, y + 1.2, 0.3, 0.95, BRANCO, "familia")


def bicama(x, yw):
    """Cama auxiliar baixa, puxada para fora, com a cabeceira para o fundo."""
    cx(x, x + 0.87, yw - 2.55, yw - 0.62, 0, 0.14, MADEIRA, "camas")
    cx(x, x + 0.87, yw - 2.55, yw - 0.64, 0.14, 0.32, BRANCO, "camas")
    cx(x, x + 0.87, yw - 2.55, yw - 1.8, 0.32, 0.35, AZUL_CLARO, "camas")
    cx(x + 0.16, x + 0.71, yw - 1.05, yw - 0.72, 0.32, 0.44, BRANCO, "camas")


def cama_pet(x, y):
    cx(x, x + 0.78, y, y + 0.58, 0, 0.16, TERRACOTA, "pet")
    cx(x + 0.1, x + 0.68, y + 0.1, y + 0.48, 0.16, 0.2, PAREDE_TOPO, "pet")
    cx(x + 0.88, x + 1.06, y + 0.04, y + 0.22, 0, 0.08, INOX, "pet")
    cx(x + 0.88, x + 1.06, y + 0.3, y + 0.48, 0, 0.08, INOX, "pet")


def kit_praia(x, y):
    """Cadeiras dobradas, guarda-sol, caixa térmica e carrinho, numa faixa de 2,2 x 0,7 m."""
    cx(x, x + 0.12, y + 0.1, y + 0.7, 0, 0.92, AZUL, "praia")
    cx(x + 0.2, x + 0.32, y + 0.1, y + 0.7, 0, 0.92, AMARELO, "praia")
    cx(x + 0.52, x + 0.64, y + 0.32, y + 0.44, 0, 1.6, TERRACOTA, "praia")
    cx(x + 0.8, x + 1.32, y + 0.14, y + 0.52, 0, 0.4, AZUL, "praia")
    cx(x + 0.8, x + 1.32, y + 0.14, y + 0.52, 0.4, 0.46, BRANCO, "praia")
    cx(x + 1.5, x + 2.15, y + 0.08, y + 0.62, 0.14, 0.6, AMARELO, "praia")
    cx(x + 1.5, x + 1.64, y, y + 0.08, 0, 0.28, ESCURO, "praia")
    cx(x + 2.0, x + 2.14, y, y + 0.08, 0, 0.28, ESCURO, "praia")


def porta_entrada(x, yw):
    """Porta de 0,8 m na parede do fundo, com capacho; a fechadura digital é melhoria."""
    cx(x, x + 0.8, yw - 0.05, yw, 0, 2.1, MADEIRA)
    cx(x + 0.08, x + 0.73, yw - 0.85, yw - 0.3, 0.01, 0.025, TERRACOTA)
    cx(x + 0.08, x + 0.2, yw - 0.075, yw - 0.05, 0.9, 1.22, ESCURO, "fechadura")
    cx(x + 0.11, x + 0.17, yw - 0.08, yw - 0.075, 1.08, 1.18, AZUL_CLARO, "fechadura")


def cozinha(x, yw):
    """Geladeira, bancada com fogão, coifa e pia, e janela sobre a pia: 2,15 m de parede a partir de x."""
    cx(x, x + 0.7, yw - 0.7, yw, 0, 1.8, INOX)
    cx(x + 0.7, x + 2.14, yw - 0.6, yw, 0, 0.9, BRANCO)
    cx(x + 0.7, x + 2.14, yw - 0.62, yw, 0.9, 0.94, ESCURO)
    cx(x + 0.8, x + 1.36, yw - 0.5, yw - 0.1, 0.94, 0.96, CINZA)
    cx(x + 0.8, x + 1.36, yw - 0.3, yw, 1.6, 1.9, INOX)
    cx(x + 1.5, x + 2.02, yw - 0.48, yw - 0.12, 0.94, 0.955, INOX)
    cx(x + 1.46, x + 2.06, yw - 0.03, yw, 1.15, 1.95, AZUL_CLARO)


def balcao(x0, x1, y):
    """Balcão americano com cafeteira, air fryer e duas banquetas do lado da sala."""
    cx(x0, x1, y, y + 0.5, 0, 1.0, BRANCO)
    cx(x0 - 0.05, x1 + 0.05, y - 0.05, y + 0.55, 1.0, 1.05, MADEIRA_CLARA)
    cx(x0 + 0.15, x0 + 0.45, y + 0.1, y + 0.4, 1.05, 1.35, ESCURO)
    cx(x0 + 0.6, x0 + 0.95, y + 0.08, y + 0.42, 1.05, 1.38, ESCURO)
    for xb in (x0 + 0.35, x1 - 0.7):
        cx(xb, xb + 0.36, y - 0.5, y - 0.14, 0, 0.7, MADEIRA)


def servico(x, yw):
    """Área de serviço: o canto da máquina (melhoria), o tanque e a prateleira. 1,25 m de parede a partir de x."""
    cx(x + 0.64, x + 1.24, yw - 0.6, yw, 0, 0.88, BRANCO)
    cx(x + 0.02, x + 1.24, yw - 0.25, yw, 1.55, 1.6, MADEIRA_CLARA)
    cx(x + 0.72, x + 1.12, yw - 0.22, yw - 0.02, 1.6, 1.85, AZUL)
    cx(x, x + 0.6, yw - 0.64, yw, 0, 0.87, BRANCO, "lavadora")
    cx(x + 0.08, x + 0.52, yw - 0.66, yw - 0.64, 0.2, 0.64, ESCURO, "lavadora")


def poltrona(x, y):
    cx(x, x + 0.8, y, y + 0.8, 0, 0.42, AZUL)
    cx(x + 0.6, x + 0.8, y, y + 0.8, 0.42, 0.86, AZUL)


def espreguicadeira(x, y):
    cx(x, x + 1.9, y, y + 0.65, 0.2, 0.32, MADEIRA_CLARA)
    cx(x, x + 0.6, y, y + 0.65, 0.32, 0.62, MADEIRA_CLARA)


def mesinha(x, y):
    """Mesinha branca com duas cadeiras, numa faixa de 1,9 x 0,7 m."""
    cx(x + 0.6, x + 1.3, y, y + 0.7, 0.66, 0.7, BRANCO)
    cx(x + 0.9, x + 1.0, y + 0.3, y + 0.4, 0, 0.66, CINZA)
    cx(x, x + 0.42, y + 0.14, y + 0.56, 0, 0.44, MADEIRA_CLARA)
    cx(x + 1.48, x + 1.9, y + 0.14, y + 0.56, 0, 0.44, MADEIRA_CLARA)


def churrasqueira(x, yw):
    """Churrasqueira de alvenaria encostada no fundo, com bancada (é melhoria)."""
    cx(x, x + 0.9, yw - 0.7, yw, 0, 0.9, TERRACOTA, "churrasqueira")
    cx(x, x + 0.9, yw - 0.6, yw, 0.9, 1.9, PAREDE, "churrasqueira")
    cx(x + 0.15, x + 0.75, yw - 0.62, yw - 0.6, 1.0, 1.5, ESCURO, "churrasqueira")
    cx(x + 0.9, x + 2.0, yw - 0.6, yw, 0, 0.9, BRANCO, "churrasqueira")
    cx(x + 0.9, x + 2.0, yw - 0.62, yw, 0.9, 0.94, ESCURO, "churrasqueira")


def escada(x0, x1, y0, y1, altura):
    """Degraus subindo da direita (x1, no chão) para a esquerda (x0, na altura do andar de cima)."""
    n = 7
    for i in range(n):
        xa = x1 - (x1 - x0) * (i + 1) / n
        cx(xa, xa + (x1 - x0) / n, y0, y1, 0, altura * (i + 1) / n, MADEIRA_CLARA)


# ---------------------------------------------------------------- planta pronta de um piso
COMODOS, ITEM_COMODO, MARCA = {}, {}, {}


def origem(dx):
    ORIGEM[0] = dx


def comodo(nome, x0, x1, y0, y1, alt):
    COMODOS[nome] = (x0 + ORIGEM[0], x1 + ORIGEM[0], y0, y1, alt, NIVEL[0])


def item(grupo, nome_comodo, x=None, y=None, z=None, topo=None):
    """Diz em que cômodo a melhoria fica e, se preciso, onde vai o marcador dela."""
    ITEM_COMODO[grupo] = nome_comodo
    if x is not None:
        MARCA[grupo] = (x + ORIGEM[0], y, z + NIVEL[0], topo + NIVEL[0])


def quarto(n, x0, larg, ym, yw, guarda_roupa_esq=False):
    """Quarto de casal numerado: cama sob a janela, cômoda à direita. Melhorias: ar, TV e blackout."""
    x1 = x0 + larg
    piso(x0, x1, ym, yw, PISO_QUARTO)
    soleira(x0 + 0.06, x1 - 1.1, ym)
    xb = x1 - 3.25                                   # cama
    cama_casal(xb, yw)
    criado(xb - 0.5, yw)
    criado(xb + 1.66, yw)
    cx(x1 - 1.02, x1 - 0.12, yw - 0.5, yw - 0.02, 0, 0.8, MADEIRA_CLARA)      # cômoda
    cx(xb + 0.2, xb + 1.4, yw - 0.03, yw, 1.2, 1.9, AZUL_CLARO)            # janela sobre a cabeceira
    cx(xb + 0.05, xb + 0.38, yw - 0.07, yw - 0.03, 1.15, 1.98, AZUL, "blackout")
    cx(xb + 1.22, xb + 1.55, yw - 0.07, yw - 0.03, 1.15, 1.98, AZUL, "blackout")
    cx(xb + 0.05, xb + 1.55, yw - 0.08, yw - 0.03, 1.96, 2.02, MADEIRA, "blackout")
    cx(xb + 0.35, xb + 1.25, yw - 0.2, yw, 2.36, 2.6, BRANCO, f"ar_q{n}")
    cx(x1 - 1.05, x1 - 0.1, yw - 0.05, yw, 1.1, 1.66, ESCURO, f"tv_q{n}")
    if guarda_roupa_esq:
        armario_esq(x0, yw - 1.45, yw - 0.05)
    comodo(f"quarto{n}", x0, x1, ym, yw, 2.7)
    item(f"ar_q{n}", f"quarto{n}")
    item(f"tv_q{n}", f"quarto{n}")
    ITEM_COMODO.setdefault("blackout", "quarto1")


def banheiro(x0, ym, yw):
    """Banheiro de 1,6 m: bancada com espelho, vaso e box de vidro. Melhoria: secador de cabelo."""
    x1 = x0 + 1.6
    piso(x0, x1, ym, yw, PISO_COZINHA)
    cx(x0 + 0.1, x0 + 0.9, yw - 0.5, yw, 0, 0.85, BRANCO)                  # bancada com cuba
    cx(x0 + 0.1, x0 + 0.9, yw - 0.52, yw, 0.85, 0.89, ESCURO)
    cx(x0 + 0.15, x0 + 0.85, yw - 0.03, yw, 1.1, 1.9, AZUL_CLARO)          # espelho
    cx(x0 + 1.02, x0 + 1.42, yw - 0.65, yw - 0.05, 0, 0.42, BRANCO)        # vaso
    cx(x0 + 1.05, x0 + 1.39, yw - 0.2, yw - 0.05, 0.42, 0.8, BRANCO)
    cx(x0 + 0.1, x0 + 1.5, ym + 0.2, ym + 1.2, 0, 0.06, CINZA)             # box
    cx(x0 + 0.1, x0 + 1.5, ym + 1.2, ym + 1.24, 0, 1.0, INOX)
    cx(x0 + 0.5, x0 + 0.64, yw - 0.34, yw - 0.14, 0.89, 1.14, ESCURO, "secador")
    cx(x0 + 0.64, x0 + 0.8, yw - 0.28, yw - 0.2, 1.02, 1.1, ESCURO, "secador")
    comodo("banheiro", x0, x1, ym + 1.0, yw, 2.2)
    item("secador", "banheiro")


def churrasqueira_esq(xw, y):
    """Churrasqueira de alvenaria encostada na parede da esquerda, com bancada."""
    cx(xw, xw + 0.7, y, y + 0.9, 0, 0.9, TERRACOTA, "churrasqueira")
    cx(xw, xw + 0.6, y, y + 0.9, 0.9, 1.9, PAREDE, "churrasqueira")
    cx(xw + 0.6, xw + 0.62, y + 0.15, y + 0.75, 1.0, 1.5, ESCURO, "churrasqueira")
    cx(xw, xw + 0.6, y + 0.9, y + 1.9, 0, 0.9, BRANCO, "churrasqueira")
    cx(xw, xw + 0.62, y + 0.9, y + 1.9, 0.9, 0.94, ESCURO, "churrasqueira")


def ducha(x, y):
    cx(x, x + 0.9, y, y + 0.9, 0, 0.04, PISO_PEDRA, "ducha")
    cx(x + 0.05, x + 0.13, y + 0.75, y + 0.83, 0, 2.15, INOX, "ducha")
    cx(x + 0.05, x + 0.4, y + 0.55, y + 0.83, 2.1, 2.16, INOX, "ducha")


def rede(x, y):
    """Rede de descanso com suporte, numa faixa de 2,4 x 0,8 m."""
    cx(x, x + 2.4, y + 0.3, y + 0.5, 0, 0.08, MADEIRA, "rede")
    cx(x, x + 0.1, y + 0.3, y + 0.5, 0.08, 1.1, MADEIRA, "rede")
    cx(x + 2.3, x + 2.4, y + 0.3, y + 0.5, 0.08, 1.1, MADEIRA, "rede")
    cx(x + 0.25, x + 2.15, y + 0.05, y + 0.75, 0.45, 0.6, TERRACOTA, "rede")


def area_externa(x0, x1, y0, y1, nome, com_ducha=False, parede_xw=None):
    """Varanda, terraço ou quintal: tudo o que fica nela é melhoria (mobília, espreguiçadeiras, rede, ducha, churrasqueira)."""
    fundo = y1 - y0 > 2.0
    ye = y0 + (0.35 if not fundo else 0.5)
    for i in range(2):
        xe = x0 + 1.7 + i * 2.1
        cx(xe, xe + 1.9, ye, ye + 0.65, 0.2, 0.32, MADEIRA_CLARA, "espreguicadeiras")
        cx(xe, xe + 0.6, ye, ye + 0.65, 0.32, 0.62, MADEIRA_CLARA, "espreguicadeiras")
    xm = x0 + 6.1
    cx(xm + 0.6, xm + 1.3, ye, ye + 0.7, 0.66, 0.7, BRANCO, "varanda")
    cx(xm + 0.9, xm + 1.0, ye + 0.3, ye + 0.4, 0, 0.66, CINZA, "varanda")
    cx(xm, xm + 0.42, ye + 0.14, ye + 0.56, 0, 0.44, MADEIRA_CLARA, "varanda")
    cx(xm + 1.48, xm + 1.9, ye + 0.14, ye + 0.56, 0, 0.44, MADEIRA_CLARA, "varanda")
    rede(x1 - 2.9, ye - 0.05)
    comodo(nome, x0, x1, y0, y1, 1.8)
    for g in ("espreguicadeiras", "varanda", "rede"):
        item(g, nome)
    if fundo and parede_xw is not None:
        churrasqueira_esq(parede_xw, y0 + 0.4)
        item("churrasqueira", nome)
    if com_ducha:
        ducha(x0 + 7.2 if x1 - x0 > 9 else x1 - 1.2, y1 - 1.0 if fundo else y0 + 0.2)
        item("ducha", nome)


def piso_unico(quartos, frente="varanda", primeiro=1):
    """Um piso inteiro, com as melhorias no lugar. Devolve a largura.

    quartos: quantos quartos neste piso (numerados a partir de `primeiro`).
    frente: "varanda" (1,3 m, deck e guarda-corpo de vidro) ou "quintal" (3 m, grama, mureta, churrasqueira e ducha).
    No fundo, da esquerda para a direita: os quartos, o banheiro, a entrada, a cozinha e a área de serviço.
    Na frente: sala de estar e jantar, e depois a varanda ou o quintal.
    """
    f = 1.3 if frente == "varanda" else 3.0
    ym, yw = f + 2.3, f + 5.7
    larguras = [4.5] + [3.8] * (quartos - 1)
    xq = [0.0]
    for l in larguras:
        xq.append(xq[-1] + l)
    xb = xq[-1]            # banheiro
    xe = xb + 1.6          # entrada
    xc = xe + 1.0          # cozinha
    xs = xc + 3.1          # área de serviço
    W = xs + 2.0
    laje(0, W, 0, yw)
    piso(xe, xc, ym, yw, PISO_SALA)
    piso(xc, W, ym, yw, PISO_COZINHA)
    piso(0, W, f, ym, PISO_SALA)
    piso(0, W, 0, f, PISO_VARANDA if frente == "varanda" else PISO_GRAMA)
    parede_fundo(0, W, yw)
    parede_esq(0, f if frente == "varanda" else 0, yw)
    if frente == "varanda":
        cx(-0.12, 0, 0, f, 0, 1.0, PAREDE)
    for x in xq[1:] + [xe]:
        divisoria(x, ym, yw)
    divisoria(xc, ym + 0.8, yw)
    divisoria(xs, ym + 1.5, yw)

    for i in range(quartos):
        quarto(primeiro + i, xq[i], larguras[i], ym, yw, guarda_roupa_esq=(i == 0))
    # mesa de trabalho no primeiro quarto, junto à parede da esquerda
    cx(0.02, 0.62, ym + 0.35, ym + 1.55, 0.7, 0.75, MADEIRA_CLARA, "mesa_trabalho")
    cx(0.05, 0.12, ym + 0.38, ym + 0.45, 0, 0.7, MADEIRA, "mesa_trabalho")
    cx(0.05, 0.12, ym + 1.45, ym + 1.52, 0, 0.7, MADEIRA, "mesa_trabalho")
    cx(0.75, 1.2, ym + 0.7, ym + 1.15, 0, 0.46, ESCURO, "mesa_trabalho")
    cx(1.14, 1.2, ym + 0.7, ym + 1.15, 0.46, 0.95, ESCURO, "mesa_trabalho")
    item("mesa_trabalho", f"quarto{primeiro}")
    item("blackout", f"quarto{primeiro}", xq[1] - 2.45, yw, 1.7, 2.25)
    banheiro(xb, ym, yw)

    # ---- entrada, cozinha e área de serviço
    porta_entrada(xe + 0.1, yw)
    comodo("entrada", xe - 0.2, xc + 0.2, ym + 1.0, yw, 2.4)
    item("fechadura", "entrada")
    cx(xc + 0.06, xc + 0.76, yw - 0.7, yw, 0, 1.8, INOX)                         # geladeira
    cx(xc + 0.76, xc + 3.02, yw - 0.6, yw, 0, 0.9, BRANCO)                       # bancada
    cx(xc + 0.76, xc + 3.02, yw - 0.62, yw, 0.9, 0.94, ESCURO)
    cx(xc + 1.5, xc + 2.06, yw - 0.5, yw - 0.1, 0.94, 0.96, CINZA)               # fogão
    cx(xc + 1.5, xc + 2.06, yw - 0.3, yw, 1.6, 1.9, INOX)                        # coifa
    cx(xc + 2.16, xc + 2.64, yw - 0.48, yw - 0.12, 0.94, 0.955, INOX)            # pia
    cx(xc + 0.84, xc + 1.4, yw - 0.64, yw - 0.6, 0.06, 0.86, INOX, "lava_loucas")
    cx(xc + 0.9, xc + 1.34, yw - 0.66, yw - 0.64, 0.72, 0.78, ESCURO, "lava_loucas")
    cx(xc + 2.72, xc + 2.96, yw - 0.18, yw, 1.2, 1.62, BRANCO, "purificador")
    cx(xc + 2.76, xc + 2.92, yw - 0.2, yw - 0.18, 1.26, 1.46, AZUL_CLARO, "purificador")
    balcao(xc + 0.25, xs - 0.25, ym - 0.1)
    cx(xs - 0.75, xs - 0.45, ym, ym + 0.3, 1.05, 1.36, TERRACOTA, "cafeteira")   # cafeteira de cápsula
    cx(xs - 0.7, xs - 0.5, ym - 0.06, ym, 1.05, 1.16, INOX, "cafeteira")
    comodo("cozinha", xc, xs, ym - 0.3, yw, 2.2)
    for g in ("purificador", "lava_loucas", "cafeteira"):
        item(g, "cozinha")
    # área de serviço: tanque e prateleira; a máquina é melhoria (comum ou lava e seca, no mesmo lugar)
    cx(xs + 0.84, xs + 1.44, yw - 0.6, yw, 0, 0.88, BRANCO)
    cx(xs + 0.12, xs + 1.44, yw - 0.25, yw, 1.55, 1.6, MADEIRA_CLARA)
    cx(xs + 0.92, xs + 1.32, yw - 0.22, yw - 0.02, 1.6, 1.85, AZUL)
    for g in ("lavadora", "lava_seca"):
        cx(xs + 0.14, xs + 0.74, yw - 0.64, yw, 0, 0.87, BRANCO, g)
        cx(xs + 0.22, xs + 0.66, yw - 0.66, yw - 0.64, 0.2, 0.64, ESCURO, g)
    cx(xs + 0.3, xs + 0.4, yw - 0.66, yw - 0.64, 0.7, 0.8, AZUL_CLARO, "lava_seca")
    cx(xs + 1.4, xs + 1.75, ym + 0.2, ym + 1.3, 0.82, 0.88, AZUL_CLARO, "ferro")   # tábua de passar aberta
    cx(xs + 1.52, xs + 1.62, ym + 0.6, ym + 0.9, 0, 0.82, INOX, "ferro")
    cx(xs + 1.48, xs + 1.68, ym + 0.95, ym + 1.2, 0.88, 1.02, ESCURO, "ferro")
    comodo("servico", xs - 0.3, W, ym + 1.4, yw, 2.0)
    for g in ("lavadora", "lava_seca", "ferro"):
        item(g, "servico")

    # ---- sala de estar e jantar
    cx(0, 0.42, f + 0.7, f + 2.1, 0, 0.5, MADEIRA_CLARA)                         # rack
    cx(0, 0.05, f + 0.8, f + 2.0, 1.0, 1.72, ESCURO, "tv_sala")
    ar_esq(0, f + 0.95, "ar_sala")
    sofa(1.6, f + 1.45)
    # sofá-cama aberto, no lugar do sofá (cobre o sofá e a mesa de centro)
    cx(1.6, 3.9, f + 2.05, f + 2.25, 0.42, 0.86, CINZA, "sofa_cama")
    cx(1.6, 3.9, f + 0.15, f + 2.05, 0, 0.3, MADEIRA, "sofa_cama")
    cx(1.6, 3.9, f + 0.15, f + 2.05, 0.3, 0.48, BRANCO, "sofa_cama")
    cx(1.6, 3.9, f + 0.15, f + 1.0, 0.48, 0.52, AZUL_CLARO, "sofa_cama")
    cx(1.8, 2.5, f + 1.55, f + 1.95, 0.48, 0.6, BRANCO, "sofa_cama")
    cx(3.0, 3.7, f + 1.55, f + 1.95, 0.48, 0.6, BRANCO, "sofa_cama")
    tapete(1.3, 4.35, f + 0.1, f + 1.75)
    luminaria(4.15, f + 1.95)
    cama_pet(0.14, f + 0.06)
    xj = max(xb + 0.4, 6.2)
    planta(xj - 1.3, f + 0.15, 1.5)
    mesa_jantar(xj, f + 0.6, 6 if quartos >= 3 else 4)
    poltrona(W - 1.35, f + 0.45)
    planta(W - 1.0, f + 1.45, 1.3)
    comodo("sala", 0, 5.6, f, ym, 2.7)
    comodo("jantar", xj - 0.8, W, f, ym, 1.6)
    for g in ("ar_sala", "tv_sala", "sofa_cama", "pet"):
        item(g, "sala")
    item("decoracao", None, 2.75, f + 1.85, 0.45, 1.0)

    # ---- frente
    if frente == "varanda":
        area_externa(0, W, 0, f, "varanda")
        guarda_corpo(0, W, 0, f)
    else:
        area_externa(0, W, 0, f, "quintal", com_ducha=True, parede_xw=0)
        mureta(0, W, 0, f)
    return W


# Todas as melhorias que uma planta pode ter. Cada planta usa as que cabem nela (apartamento não tem
# churrasqueira nem ducha; quarto 3 só existe em quem tem três quartos).
MELHORIAS = ["decoracao", "ar_sala", "tv_sala", "sofa_cama", "pet", "fechadura",
             "ar_q1", "ar_q2", "ar_q3", "tv_q1", "tv_q2", "tv_q3", "blackout", "mesa_trabalho", "secador",
             "lavadora", "lava_seca", "ferro", "lava_loucas", "purificador", "cafeteira",
             "varanda", "espreguicadeiras", "rede", "ducha", "churrasqueira"]
GRUPOS = ["base"] + MELHORIAS
# Em que pintura cada melhoria entra. A decoração vai sozinha (fica atrás de outras coisas); a lava e seca e o
# sofá-cama vão à parte porque ocupam o lugar da máquina comum e do sofá.
CENA_DE = {g: "itens" for g in MELHORIAS}
CENA_DE.update(decoracao="decoracao", lava_seca="trocas", sofa_cama="trocas")


# ---------------------------------------------------------------- a planta do modelo
MODELO = sys.argv[3] if len(sys.argv) > 3 else "apto2"
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos", MODELO + ".py"), encoding="utf-8").read(), MODELO + ".py", "exec"))
PRESENTES = [g for g in MELHORIAS if any(c[7] == g for c in CAIXAS)]
estranhos = sorted({c[7] for c in CAIXAS} - set(GRUPOS))
assert not estranhos, f"grupo desconhecido em {MODELO}: {estranhos}"


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
quem = {}
for cena in ("decoracao", "itens", "trocas"):
    quem[cena] = grava(cena, {"base"} | {g for g in PRESENTES if CENA_DE[g] == cena})

itens = {}
for g in PRESENTES:
    m = reduz((quem[CENA_DE[g]] == GRUPOS.index(g)).astype(np.float32))
    Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(SAIDA, f"mascara-{g}.png"))
    ys, xs = np.nonzero(m > 0.05)
    if len(xs) == 0:
        print(f"ATENCAO: {g} não aparece na tela")
        continue
    itens[g] = {
        "cena": CENA_DE[g],
        "caixa": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "centro": [float(np.average(xs, weights=m[ys, xs])), float(np.average(ys, weights=m[ys, xs]))],
        "visivel": round(float(m.sum()), 1),
        "comodo": ITEM_COMODO.get(g),
    }
    if g in MARCA:
        mx, my, mz, mtopo = MARCA[g]
        (px1, px2), (py1, py2), (fh, _fh2), (fd, _fd2) = tela(np.array([(mx, my, mz), (mx, my, mtopo)]))
        itens[g]["marca"] = [float(px1), float(py1), float(py2), float((fh - H0) / (H1 - H0)), float((fd - D0) / (D1 - D0))]

if os.environ.get("CONFERIR"):
    # dentro da mesma pintura, nenhuma melhoria pode cobrir outra na tela: cada uma vira uma camada solta
    silhuetas = {}
    for g in PRESENTES:
        _c, _h, _d, q = desenha({g})
        silhuetas[g] = reduz((q >= 0).astype(np.float32)) > 0.02
        cheio = float(silhuetas[g].sum())
        if g in itens and itens[g]["visivel"] < 0.45 * cheio:
            print(f"ATENCAO: {g} está {100 - round(100 * itens[g]['visivel'] / cheio)}% escondido")
    for i, ga in enumerate(PRESENTES):
        for gb in PRESENTES[i + 1:]:
            if CENA_DE[ga] != CENA_DE[gb]:
                continue
            cruza = int((silhuetas[ga] & silhuetas[gb]).sum())
            if cruza:
                print(f"ATENCAO: {ga} e {gb} se cruzam na tela em {cruza} pontos")

comodos = {}
for nome, medida in COMODOS.items():
    x0, x1, y0, y1, alt = medida[:5]
    zc = medida[5] if len(medida) > 5 else 0
    pts = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (zc, zc + alt)])
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
    "modelo": MODELO, "itens": itens, "comodos": comodos,
}, open(os.path.join(SAIDA, "cena.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", LARG, ALT, "px/m", round(float(escala), 1), "caixas", len(CAIXAS))
