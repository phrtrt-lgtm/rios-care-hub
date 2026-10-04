# Animação "RIOS fluxo"

Fundo animado do topo da página de resultados do imóvel (`/resultados`): correntes
em azul e terracota que emendam em loop de 10 s. Feito em [Remotion](https://www.remotion.dev)
— o vídeo é gerado a partir do código em `src/`.

Os arquivos usados pelo site ficam em `public/animacoes/` (`rios-fluxo.webm`,
`rios-fluxo.mp4` e o quadro inicial `rios-fluxo-poster.jpg`). Este diretório não
entra no build do portal; serve só para gerar o vídeo de novo.

```bash
npm install
npx remotion render src/index.ts RiosFluxo out/rios-fluxo.webm --codec vp9 --crf 40
npx remotion render src/index.ts RiosFluxo out/rios-fluxo.mp4 --codec h264 --crf 27 --pixel-format yuv420p
npx remotion still  src/index.ts RiosFluxo out/rios-fluxo-poster.jpeg --frame 0 --image-format jpeg --jpeg-quality 72
```

Licença: o Remotion é gratuito para pessoas e empresas de até 3 pessoas; acima
disso exige licença de empresa (ver remotion.dev/license).
