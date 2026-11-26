# Casa de dois pisos: o térreo à direita (um quarto, sala, cozinha e quintal) e o andar de cima à esquerda,
# erguido, com dois quartos e a varanda. Uma escada liga os dois.
ALTO = 1.3
WU = 8.4
cx(-0.12, WU, 3.0, 8.7 + 0.12, -0.28, ALTO, LAJE)          # a base que ergue o andar de cima
nivel(ALTO)
parede_fundo(0, WU, 8.7)
parede_esq(0, 3.0, 8.7)
quarto(2, 0, 4.5, 5.3, 8.7, guarda_roupa_esq=True)
quarto(3, 4.5, 3.9, 5.3, 8.7)
divisoria(4.5, 5.3, 8.7)
piso(0, WU, 3.0, 5.3, PISO_VARANDA)
guarda_corpo(0, WU, 3.0, 5.3)
comodo("varanda_cima", 0, WU, 3.0, 5.3, 1.6)
nivel(0)
escada(WU, WU + 1.5, 5.3 + 0.6, 5.3 + 1.6, ALTO)
origem(WU + 1.5)
piso_unico(1, "quintal")
origem(0)
