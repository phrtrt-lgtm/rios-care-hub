# Mini Paulo animado (página de resultados)

O Paulo que apresenta os resultados no topo de `/resultados/:id` é o mesmo dos vídeos da RIOS: clipes
curtos, de meio corpo, com o rosto e a fala animados (feitos na Atlas Cloud para o vídeo "O portal do
proprietário"). Esta pasta guarda o roteiro que transforma esses clipes nos arquivos que a página toca.
Fica fora do build.

Em 2026-11-20 o topo estreou com um boneco 3D ao vivo (o modelo do jogo, feito no Tripo). O gestor achou
tosco de perto ("é melhor tirar da tripo, se for fazer algo é melhor boneco animado") e ele saiu no dia
seguinte. O histórico do Git guarda aquela versão (`motion/paulo-3d`, commit `c7697f52`).

## De onde vêm os clipes

`C:/Users/pc/rios-video/sistema-proprietario/public/paulo/c1..c7.webm` (projeto do vídeo, fora deste
repositório): WebM VP9 com transparência, 1088x1920, já com o bordado oficial na polo.

| Na página | Clipe | O que ele faz |
|---|---|---|
| `ola.mp4` | c3 | acena e explica com o dedo erguido |
| `apresenta.mp4` | c1 | mão estendida, falando |
| `joia.mp4` | c4 | joinha, de perto |
| `encantado.mp4` | c6 | mãos no rosto |
| `descanso.mp4` | c7 | braços cruzados, em laço (é a espera entre as falas) |
| `descanso.webp` | c7 | quadro parado: "reduzir movimento" e enquanto o vídeo não chega |

Os de corpo inteiro (c2, c5) ficaram de fora: a cabeça sai bem menor que nos outros e a troca de clipe
pareceria um salto.

## Regerar

```bash
python -I motion/paulo-filme/preparar.py
```

Grava em `public/paulo/` (uns 1,5 MB no total; a página baixa o oi e o descanso primeiro e o resto depois).

## O que o roteiro decide

- **Vídeo empilhado.** O iPhone não lê a transparência do WebM. Cada clipe vira um MP4 comum com a cor
  na metade de cima e a máscara em cinza na de baixo; a página junta as duas num canvas
  (`src/components/resultados/paulo/videoComAlfa.ts`).
- **Mesmo quadro para todos.** O recorte é sempre 1240x1554 a partir de y = 180, com a cabeça a 60% da
  largura. O que muda por clipe é onde a cabeça está (`centro_x`, medido no canal alfa). Assim ele não
  pula de lugar quando o clipe troca.
- **Máscara firmada.** O recorte de fundo verde deixou a roupa com 80 a 95% de opacidade. No vídeo do
  portal não aparece; em cima da foto de um imóvel o fundo vazaria pelo Paulo. De 70% para cima vira
  opaco.
- **Laço do descanso.** Os últimos 0,4 s se desfazem nos primeiros 0,4 s, e o clipe emenda sem tranco.

## Clipe novo

Um gesto novo (por exemplo, um descanso mais longo) é um clipe novo na Atlas, pelo mesmo caminho do
vídeo do portal (ver a memória "Vídeo do portal do proprietário"): cerca de US$ 1,70 por 5 segundos, e
o bordado tem de ser conferido. Depois é acrescentar a linha em `CLIPES` e o nome em
`PauloDeFilme.tsx`.
