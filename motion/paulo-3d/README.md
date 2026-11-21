# Mini Paulo em 3D (página de resultados)

O Paulo que aparece no topo de `/resultados/:id` é o mesmo modelo do jogo Maré Alta: feito no Tripo
(com esqueleto e animações) e com o bordado oficial "RIOS HOSPEDAGENS" aplicado por código na textura.
Esta pasta guarda o que transforma o arquivo do Tripo no arquivo que a página baixa. Fica fora do build.

| Arquivo | O que faz |
|---|---|
| `empacotar.mjs` | Lê o modelo do Tripo e grava `public/resultados3d/paulo.glb` (um arquivo só, ~0,6 MB) |
| `assar_sombra.py` | No Blender: pinta a sombra das dobras na textura de cor (`cor-com-sombra.jpg`) |
| `tex_webp.py` | Converte a textura para WebP (o `sharp` do Node falha neste computador) |
| `cor-com-sombra.jpg` | Textura de cor com a sombra já assada, que o `empacotar.mjs` usa |

## De onde vem o modelo

`C:/Users/pc/mare-alta/art/3d/glb-bordado/paulo/tripo-export.glb` (projeto do jogo, fora deste
repositório): 58 mil triângulos, 65 ossos (esqueleto Mixamo), textura 2048 com o bordado certo e 17
animações. As ferramentas (`gltf-transform`, `meshoptimizer`) são as instaladas em `tools/rig` de lá.

## Regerar

```bash
node motion/paulo-3d/empacotar.mjs
```

Sai o `paulo.glb` com 18 mil triângulos, textura de 1536 px em WebP e sete animações, comprimido com
meshopt (a página lê com `GLTFLoader` + `MeshoptDecoder`). O script imprime o tamanho e a duração de
cada animação.

Para refazer a sombra assada (só se a textura do modelo mudar; leva uns 4 minutos):

```bash
"C:/Users/pc/ferramentas/blender/blender-4.5.9-windows-x64/blender.exe" -b --factory-startup \
  -P motion/paulo-3d/assar_sombra.py -- \
  "C:/Users/pc/mare-alta/art/3d/glb-bordado/paulo/tripo-export.glb" saida.png 0.6 0.07
```

Depois converta `saida.png` para `motion/paulo-3d/cor-com-sombra.jpg` (qualidade 93) e rode o
`empacotar.mjs`.

## O que o script decide

- **Animações que ficam:** `idle`, `look`, `greet`, `walk`, `cheer`, `point` (era `cast_a_spell`) e
  `dance`. O joinha sob medida ficou de fora: visto de frente, a mão cobre o rosto e parece desânimo.
- **Trilhas sem uso saem de verdade.** Tirar um canal de animação no `gltf-transform` não tira a trilha
  dele; sem apagar as duas, o arquivo carregava 1 MB de números que ninguém lia.
- **Ninguém sai do lugar.** O `walk` e o `greet` do Tripo andam para a frente: a deriva é retirada (quem
  move o Paulo é a página). A dança passeava quase um corpo em direção à câmera: o passeio é encolhido.
- **Dedos ficam.** Na página ele aparece grande; o jogo descartava os dedos.

## O que a página faz com as animações

Em `src/components/resultados/cena3d/pauloCena.ts`:

- `greet` e `point` são usados só em parte do corpo (`GESTOS_DE_MEIO_CORPO`): os braços vêm do gesto e
  as pernas continuam as do `idle`. Sem isso o aceno marcha no lugar e o "apontar" vem agachado.
- Parado, ele alterna `idle` e `look`; a cabeça acompanha o mouse por cima da animação.

## Conferir

Monte a galeria local (`preview.html` + `src/__preview/`, ver a memória "Conferir design sem login") e
abra `?folha=1` para a folha de quadros de todas as animações, ou `?folha=1&so=point&tronco=1` para
ver um gesto como a página o usa.
