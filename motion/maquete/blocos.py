# Prepara os pedidos de pintura de um modelo: cola na pintura da base os blocos chapados das melhorias
# (tirados da planta), monta a máscara que diz ao GPT Image onde ele pode repintar e escreve o jobs.json.
#
#   python -I motion/maquete/blocos.py <pasta da arte do modelo> [base]
#
# Com "base", só escreve o jobs.json (é o que se roda antes de pintar a base).
# Entra:  cena.json, guia-<cena>.png, mascara-<item>.png (de cena.py) e pintura-base.png
# Sai:    entrada-<cena>.png, mascara-pedido-<cena>.png e jobs.json
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

PASTA = sys.argv[1].rstrip("/\\") + "/"
SO_PEDIDOS = len(sys.argv) > 2 and sys.argv[2] == "base"
FOLGA = 12  # px em volta de cada bloco, para a sombra e o contorno do objeto pintado
ESTILO = os.path.relpath("C:/Users/pc/mare-alta/art/cenario/salas/casa-deitada.png", PASTA).replace("\\", "/")

cena = json.load(open(PASTA + "cena.json", encoding="utf-8"))
MODELO = cena["modelo"]
itens = cena["itens"]
CENAS = {}
for nome, info in itens.items():
    CENAS.setdefault(info["cena"], []).append(nome)

# ---------------------------------------------------------------- o que é cada planta (para o pedido da base)
QUARTO = ("cama de casal com cabeceira de madeira e roupa de cama branca com colcha azul-clara lisa, dois criados-mudos com abajur aceso, "
          "uma cômoda baixa de madeira e uma janela de veneziana azul na parede do fundo, sobre a cabeceira")
PISO = ("No fundo, da esquerda para a direita: {quartos}; um banheiro pequeno (bancada branca com cuba e espelho, vaso sanitário e box de vidro); "
        "a entrada, com a porta de madeira fechada e um capacho; a cozinha (geladeira de inox, bancada branca de tampo escuro, fogão, coifa de inox, pia e "
        "janela sobre a pia) com um balcão americano branco de tampo de madeira, uma cafeteira elétrica preta, uma air fryer preta e duas banquetas de madeira; "
        "e a área de serviço, com um tanque branco e uma prateleira de madeira com produtos. Na frente: a sala de estar (rack baixo de madeira encostado na "
        "parede da esquerda, sofá azul com chaise e mesa de centro de madeira), a mesa de jantar de madeira com cadeiras e uma poltrona azul. {frente}")
Q = {1: "um quarto de casal (" + QUARTO + ", e um guarda-roupa alto de madeira na parede da esquerda)",
     2: "dois quartos de casal (cada um com " + QUARTO + "; o primeiro tem também um guarda-roupa alto de madeira na parede da esquerda)",
     3: "três quartos de casal (cada um com " + QUARTO + "; o primeiro tem também um guarda-roupa alto de madeira na parede da esquerda)"}
VARANDA = "Na borda da frente, a varanda de deck de madeira, VAZIA, com guarda-corpo de vidro transparente e corrimão de metal."
QUINTAL = "Na frente, o quintal de grama verde, VAZIO, cercado por uma mureta branca baixa."
DOIS = ("A maquete tem DOIS BLOCOS lado a lado, ligados por uma escada de madeira. O bloco da direita é o andar de baixo. O bloco da esquerda é o andar de "
        "cima: ele fica erguido sobre uma base alta e lisa de concreto claro e tem {cima} ")
PLANTA = {
    "apto1": ("um apartamento de praia de um quarto", PISO.format(quartos=Q[1], frente=VARANDA)),
    "apto2": ("um apartamento de praia de dois quartos", PISO.format(quartos=Q[2], frente=VARANDA)),
    "apto3": ("um apartamento de praia de três quartos", PISO.format(quartos=Q[3], frente=VARANDA)),
    "casa_terrea": ("uma casa de praia térrea de três quartos", PISO.format(quartos=Q[3], frente=QUINTAL)),
    "cobertura": ("uma cobertura duplex de praia",
                  DOIS.format(cima="um quarto de casal (" + QUARTO + ", e um guarda-roupa alto) e um terraço grande de deck de madeira, VAZIO, com guarda-corpo de vidro.")
                  + "No andar de baixo: " + PISO.format(quartos=Q[1], frente=VARANDA)),
    "casa_duplex": ("uma casa de praia de dois andares",
                    DOIS.format(cima="dois quartos de casal (cada um com " + QUARTO + ") e, na frente deles, uma varanda de deck de madeira, VAZIA, com guarda-corpo de vidro.")
                    + "No andar de baixo: " + PISO.format(quartos=Q[1], frente=QUINTAL)),
}
BASE = ("Repinte a Imagem 1 como a maquete em corte de {oque}, no MESMO estilo da Imagem 2: pintura de animação de cinema para a família, com cara de render 3D "
        "caprichado, noite com luzes quentes e amarelas, materiais ricos (madeira, piso, tecido). A Imagem 1 é a planta exata, vista de cima e de lado, sem "
        "perspectiva: mantenha cada parede, cada móvel e cada objeto no mesmo lugar, do mesmo tamanho e no mesmo ângulo. Não mude a câmera, não gire, não aproxime, "
        "não acrescente nem tire cômodos. Não há teto. As paredes da frente e da direita foram cortadas para a gente ver dentro; as divisórias internas são cortadas "
        "a meia altura, com o topo claro e liso. Só a parede do fundo e a da esquerda são inteiras.\n\nO que é cada coisa na Imagem 1. {planta}\n\n"
        "Piso de madeira clara nos quartos, porcelanato claro na sala, na entrada, no banheiro e na cozinha. Paredes brancas com rodapé azul. A laje embaixo aparece "
        "como uma base grossa de concreto claro.\n\nÉ um imóvel arrumado, limpo e SIMPLES, ainda sem os confortos: paredes lisas e vazias. Sem quadros, sem tapetes, "
        "sem plantas, sem vasos, sem almofadas, sem mantas, sem luminária de piso, sem cortinas, SEM ar-condicionado, SEM televisão, sem máquina de lavar, sem tábua "
        "de passar, sem rede, sem churrasqueira, sem ducha, sem móveis na área externa, sem fechadura eletrônica. Deixe lisos e vazios: a parede acima das janelas "
        "dos quartos, a parede acima das cômodas, a parede acima do rack da sala, o canto da área de serviço ao lado do tanque e toda a área externa.\n\n"
        "Fundo liso azul-noite bem escuro, como na Imagem 1: sem céu, sem mar, sem estrelas, sem chão, só a maquete, com um brilho quente e bem suave em volta da base. "
        "Imagem deitada. Sem personagens, sem pessoas, sem animais, sem texto, sem letras, sem números, sem interface, sem moldura.")

# ---------------------------------------------------------------- o que é cada bloco (para os pedidos de edição)
BLOCO = {
    "ar_q": "as caixas brancas compridas no alto da parede do fundo dos quartos, acima das janelas, são aparelhos de ar-condicionado split brancos",
    "tv_q": "os retângulos escuros na parede do fundo dos quartos, acima das cômodas, são smart TVs finas de tela preta presas na parede",
    "blackout": "as faixas azul-escuras dos dois lados das janelas dos quartos, com uma barra de madeira em cima, são cortinas blackout de tecido grosso azul-escuro, abertas, num varão de madeira",
    "mesa_trabalho": "o tampo de madeira com uma cadeira escura, junto à parede da esquerda do primeiro quarto, é uma mesa de trabalho de madeira clara com uma cadeira de escritório preta",
    "secador": "o pequeno objeto escuro sobre a bancada do banheiro é um secador de cabelo preto",
    "lavadora": "a caixa branca com uma porta escura na frente, na área de serviço, ao lado do tanque, é uma máquina de lavar roupa branca de abertura frontal, com porta redonda de vidro",
    "ferro": "a prancha azul-clara sobre um pé de metal, com um objeto escuro em cima, na área de serviço, é uma tábua de passar aberta com um ferro de passar em cima",
    "lava_loucas": "o painel de inox na frente da bancada da cozinha, ao lado da geladeira, é uma lava-louças de inox embutida na bancada",
    "purificador": "a caixinha branca na parede da cozinha, à direita da pia, é um purificador de água branco de parede",
    "cafeteira": "o objeto cor de tijolo na ponta direita do balcão americano é uma cafeteira de cápsulas pequena, vermelha",
    "ar_sala": "a caixa branca comprida no alto da parede da esquerda, na sala, é um ar-condicionado split branco",
    "tv_sala": "o retângulo escuro na parede da esquerda, acima do rack, é uma smart TV grande de tela preta presa na parede",
    "pet": "a almofada cor de tijolo com centro creme e os dois potinhos de metal, no canto da sala, são uma caminha de pet redonda terracota com almofada creme e dois potes de inox",
    "fechadura": "o retângulo escuro pequeno com um detalhe azul-claro na porta de entrada, na altura da maçaneta, é uma fechadura digital preta com teclado aceso em azul",
    "varanda": "o tampo branco com duas caixas de madeira ao lado, na área externa, é uma mesinha redonda branca com duas cadeiras de madeira",
    "espreguicadeiras": "as duas peças compridas de madeira na área externa são duas espreguiçadeiras de madeira com encosto levantado",
    "rede": "a armação de madeira com um pano cor de tijolo no meio é uma rede de descanso terracota pendurada num suporte de madeira",
    "ducha": "a haste de metal sobre um quadrado de pedra no chão é uma ducha externa de inox, com piso de pedra",
    "churrasqueira": "o bloco cor de tijolo com uma coluna clara em cima e uma bancada branca ao lado é uma churrasqueira de alvenaria de tijolinho, com coifa branca e bancada branca de tampo escuro",
    "lava_seca": "a caixa branca com uma porta escura e um detalhe azul-claro na frente, na área de serviço, ao lado do tanque, é uma máquina lava e seca branca, grande, de abertura frontal, com porta redonda de vidro e painel digital aceso",
    "sofa_cama": "o bloco baixo branco e azul-claro com um encosto cinza, no lugar do sofá da sala, é um sofá-cama cinza aberto, virado cama de casal, com lençol branco, colcha azul-clara e dois travesseiros brancos (ele fica no lugar do sofá azul e da mesa de centro, que somem)",
}
DECOR = ("os retângulos cor de tijolo nas paredes são quadros com moldura de madeira clara e pinturas de praia, mar e barquinhos em azul e terracota; as faixas cor de tijolo "
         "sobre os pés das camas são mantas de tricô terracota dobradas; os cubos cor de tijolo sobre as camas são almofadas decorativas terracota; o retângulo grande "
         "cor de tijolo no chão da sala, embaixo do sofá e da mesa de centro, é um tapete de fibra natural bege com barra azul; os três cubos amarelos e cor de tijolo no "
         "sofá são almofadas decorativas (duas amarelo-mostarda e uma terracota); a haste escura com um cubo amarelo no alto, ao lado do sofá, é uma luminária de piso "
         "acesa, de cúpula de tecido; as caixas verdes sobre vasos cor de tijolo são plantas tropicais grandes, de folhas largas, em vasos de barro; a caixa verde sobre "
         "a mesa de jantar é um arranjo de folhagens num vaso baixo")
EDITA = ("A Imagem 1 é a maquete pintada de um imóvel de praia, com alguns BLOCOS CHAPADOS de cor lisa colados por cima: eles marcam onde entram objetos novos. Repinte "
         "cada bloco chapado como o objeto de verdade, no MESMO estilo de pintura da maquete (animação de cinema com cara de render 3D caprichado), na mesma luz quente "
         "da noite e no mesmo ângulo, ocupando o lugar e o tamanho do bloco e apoiado no chão, no móvel ou na parede com uma sombra suave. Não mude mais nada: paredes, "
         "pisos, móveis, luzes, câmera e fundo ficam idênticos. O que é cada bloco: {blocos}. Nenhum bloco chapado pode sobrar: todos viram objeto pintado, com volume, "
         "textura e detalhe. Sem pessoas, sem animais, sem texto, sem letras, sem números, sem interface, sem moldura.")


def descreve(nomes):
    partes, vistos = [], set()
    for n in nomes:
        chave = "ar_q" if n.startswith("ar_q") else "tv_q" if n.startswith("tv_q") else n
        if chave in vistos:
            continue
        vistos.add(chave)
        partes.append(DECOR if n == "decoracao" else BLOCO[chave])
    return "; ".join(partes)


oque, planta = PLANTA[MODELO]
jobs = [{"id": "base", "out": "pintura-base.png", "images": ["guia-base.png", ESTILO], "prompt": BASE.format(oque=oque, planta=planta)}]
for nome_cena, nomes in CENAS.items():
    jobs.append({"id": nome_cena, "out": f"pintura-{nome_cena}.png", "images": [f"entrada-{nome_cena}.png"], "mask": f"mascara-pedido-{nome_cena}.png",
                 "prompt": EDITA.format(blocos=descreve(nomes))})
json.dump({"defaults": {"model": "gpt-image-2.6-sunburst", "quality": "xhigh", "size": f"{cena['largura']}x{cena['altura']}", "background": "opaque", "output_format": "png"},
           "jobs": jobs}, open(PASTA + "jobs.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
if SO_PEDIDOS:
    print(MODELO, "pedidos:", [j["id"] for j in jobs])
    sys.exit(0)

base = np.asarray(Image.open(PASTA + "pintura-base.png").convert("RGB"), dtype=np.float32)
for nome_cena, nomes in CENAS.items():
    guia = np.asarray(Image.open(PASTA + f"guia-{nome_cena}.png").convert("RGB"), dtype=np.float32)
    m = np.zeros(base.shape[:2], dtype=np.float32)
    for n in nomes:
        m = np.maximum(m, np.asarray(Image.open(PASTA + f"mascara-{n}.png").convert("L"), dtype=np.float32) / 255)
    entrada = base * (1 - m[..., None]) + guia * m[..., None]
    Image.fromarray(entrada.astype(np.uint8)).save(PASTA + f"entrada-{nome_cena}.png")
    # reduz antes de alargar: o filtro de máximo é lento na imagem inteira
    pequeno = Image.fromarray(((m > 0.02) * 255).astype(np.uint8)).resize((m.shape[1] // 2, m.shape[0] // 2), Image.BILINEAR)
    folga = pequeno.filter(ImageFilter.MaxFilter(FOLGA + 1)).resize((m.shape[1], m.shape[0]), Image.BILINEAR)
    alfa = np.where(np.asarray(folga) > 8, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.zeros_like(alfa), np.zeros_like(alfa), np.zeros_like(alfa), alfa])
    Image.fromarray(rgba, "RGBA").save(PASTA + f"mascara-pedido-{nome_cena}.png")
    print(MODELO, nome_cena, len(nomes), "itens; repinta", round(float((alfa == 0).mean()) * 100, 1), "% da imagem")
