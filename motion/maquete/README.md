# Maquete do plano de melhorias

A aba **Melhorias** da página de resultados (`/resultados/:id?aba=melhorias`) mostra um apartamento em
maquete: uma pintura no estilo do Maré Alta que gira como maquete de verdade e ganha uma camada para cada
melhoria (lava e seca, ar na sala, decoração, kit família, cama extra, pet, kit praia, fechadura digital).
Esta pasta guarda os roteiros que geram os arquivos da maquete. Fica fora do build.

A ideia: **a planta em blocos manda em tudo**. Dela saem o guia que o GPT Image pinta, a profundidade de
cada ponto (é o que faz a pintura girar) e a máscara de cada melhoria (é o que vira camada). Como a pintura
segue a planta, as três coisas se encaixam.

## Passo a passo

A arte fica fora deste repositório, em `C:/Users/pc/mare-alta/art/maquete-portal/` (o projeto do jogo, onde
mora a ferramenta de imagem e a chave da OpenAI do gestor).

```bash
ARTE="C:/Users/pc/mare-alta/art/maquete-portal"

# 1. a planta: guias, profundidade, máscaras e cena.json (uns 4 minutos neste computador; SS=1 para rascunho)
python -I motion/maquete/cena.py "$ARTE" 2048x1360

# 2. pintar a base (pedido "base" de jobs.json: o guia + a casa do Maré Alta como referência de estilo)
cp motion/maquete/jobs.json "$ARTE/jobs.json"   # os pedidos ficam aqui; a ferramenta lê da pasta da arte
cd C:/Users/pc/mare-alta
powershell -NoProfile -ExecutionPolicy Bypass -File tools/chave/com-chave-openai.ps1 node tools/openai-edit.mjs art/maquete-portal/jobs.json --only base

# 3. colar os blocos das melhorias na pintura e montar as máscaras dos pedidos
python -I motion/maquete/blocos.py "$ARTE"

# 4. pintar a decoração e as outras melhorias (dois pedidos, cada um repinta só os blocos)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/chave/com-chave-openai.ps1 node tools/openai-edit.mjs art/maquete-portal/jobs.json --only decoracao,itens

# 5. recortar as camadas e gravar o que a página usa (uns 6 minutos)
python -I motion/maquete/camadas.py "$ARTE"
```

O passo 5 grava `public/melhorias/` (`base.webp`, `camada-*.webp`, `prof-*.webp`; 0,7 MB no total) e
`src/components/resultados/melhorias/maqueteManifesto.ts`. A miniatura da chamada na visão geral
(`public/melhorias/completa-960.webp`) é a `prova-completa.png` da pasta da arte reduzida para 960 px.

Custo da primeira rodada (2026-11-22): **US$ 0,35** (três imagens de 2048×1360 em `xhigh`, US$ 0,11 a
0,12 cada, pela chave da OpenAI do gestor). Saíram certas na primeira tentativa.

## O que cada roteiro decide

- **`cena.py`**: o apartamento em caixas (medidas em metros), a câmera (30° de lado, 35° de altura, sem
  perspectiva) e um desenhista simples com z-buffer. As paredes do fundo e da esquerda são inteiras; as
  divisórias são cortadas a 1 m, para a vista entrar nos cômodos. Cada melhoria é um grupo de caixas. Sai
  uma cena com a decoração e outra com as demais melhorias: a decoração é a única que fica atrás de outra
  (a manta da cama atrás da cama auxiliar), e pintada à parte a camada dela sai inteira. `CONFERIR=1` avisa
  se duas melhorias se cruzam na tela.
- **`blocos.py`**: o GPT Image coloca um objeto no lugar certo quando o lugar já está marcado na imagem. Por
  isso os blocos chapados da planta vão colados em cima da pintura, e o pedido diz o que cada bloco é.
- **`camadas.py`**: a camada é a diferença entre a pintura com a melhoria e a pintura da base, só em volta
  de onde a melhoria foi posta (o GPT Image mexe um pouco na imagem inteira a cada pedido, e isso não pode
  vazar). A profundidade do fundo vazio é estendida a partir da maquete, senão o brilho em volta da base se
  descola ao girar.

## Na página

- `src/components/resultados/melhorias/maqueteCena.ts`: WebGL puro (um triângulo e um shader, sem three).
  Compõe a pintura e a profundidade num canvas 2D com as camadas ligadas, manda para a placa de vídeo e,
  a cada quadro, desloca cada ponto conforme a profundidade e o giro. Trocar uma camada faz uma onda que
  nasce no lugar do item.
- `Maquete.tsx`: o canvas, os marcadores em HTML presos a cada item e a versão sem WebGL (as mesmas imagens
  empilhadas, paradas).
- `PlanoDeMelhorias.tsx` e `src/lib/melhorias.ts`: as etapas, a conta e os textos. **As faixas de ganho e de
  custo de cada melhoria estão em `MELHORIAS`, em `src/lib/melhorias.ts`.**

## Melhoria nova

1. Em `cena.py`: as caixas do item com um grupo novo, o nome em `GRUPOS` e o cômodo em `ITEM_COMODO`.
2. Em `blocos.py` (`CENAS`) e em `camadas.py` (`ORDEM`): o nome do grupo.
3. Em `motion/maquete/jobs.json`: a frase que diz o que é o bloco novo, no pedido `itens` (e copiar para a pasta da arte).
4. Rodar os passos 1, 3, 4 (só `itens`, apagando antes a `pintura-itens.png`) e 5.
5. Em `src/lib/melhorias.ts`: a entrada em `MELHORIAS`; no banco, a leitura da ficha em
   `melhorias_da_ficha` (migration nova).

A pintura da base não precisa ser refeita para uma melhoria nova: os pedidos editam a base que já existe.
