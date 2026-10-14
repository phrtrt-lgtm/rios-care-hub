# Reel dos imóveis (landing de captação)

Fundo do painel da marca em `/cadastro-imovel`: dez trechos de 4 a 4,5 s dos
vídeos dos imóveis e da região, cortados para 4:5 e fundidos (0,6 s), em dois
tamanhos: `public/videos/captacao/imoveis-640.mp4` (desktop, 640×800, ~3 MB)
e `imoveis-432.mp4` (celular, 432×540, ~1,4 MB), mais o quadro de abertura
`imoveis-poster.jpg`. Sem áudio; H.264 com `faststart` para começar rápido.

Os vídeos de origem ficam fora do repositório (`C:\Users\pc\Downloads`,
lista em `monta-reel.py`). Para trocar um trecho, edite `CLIPES` (arquivo,
início em segundos, duração) e rode, com o ffmpeg no PATH:

```bash
python motion/captacao-reel/monta-reel.py
```

Os três arquivos saem na pasta atual; copie para `public/videos/captacao/`.
Mantenha o total perto de 36 s e os arquivos leves: é fundo, não vídeo
principal, e toca também no celular.
