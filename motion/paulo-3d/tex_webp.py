# Converte uma textura para WebP no tamanho pedido.
#   python -I tex_webp.py entrada saida.webp tamanho [qualidade]
# (o sharp do Node falha neste computador com "colourspace: parameter space not set")
import sys

from PIL import Image

src, dst, tam = sys.argv[1], sys.argv[2], int(sys.argv[3])
q = int(sys.argv[4]) if len(sys.argv) > 4 else 84
im = Image.open(src)
im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
if tam:
    im = im.resize((tam, tam), Image.LANCZOS)
im.save(dst, "WEBP", quality=q, method=6)
