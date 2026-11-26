# Cobertura duplex: o andar de baixo à direita (quarto, sala, cozinha e varanda) e o de cima à esquerda,
# erguido, com a suíte e o terraço (churrasqueira, ducha, espreguiçadeiras, mesa e rede). Uma escada liga os dois.
ALTO = 1.3
WU = 8.4
cx(-0.12, WU, 1.3, 7.0 + 0.12, -0.28, ALTO, LAJE)          # a base que ergue o andar de cima
nivel(ALTO)
parede_fundo(0, WU, 7.0)
parede_esq(0, 1.3, 7.0)
quarto(2, 0, 4.5, 3.6, 7.0, guarda_roupa_esq=True)
piso(4.5, WU, 3.6, 7.0, PISO_VARANDA)
piso(0, WU, 1.3, 3.6, PISO_VARANDA)
divisoria(4.5, 3.6, 7.0)
# o terraço leva as melhorias de área externa; a varanda de baixo fica só com o guarda-corpo
churrasqueira(5.2, 7.0)
item("churrasqueira", "terraco")
ducha(0.5, 2.2)
item("ducha", "terraco")
guarda_corpo(0, WU, 1.3, 7.0)
comodo("terraco", 0, WU, 1.3, 7.0, 2.2)
nivel(0)
escada(WU, WU + 1.5, 3.6 + 0.6, 3.6 + 1.6, ALTO)
origem(WU + 1.5)
piso_unico(1)
origem(0)
