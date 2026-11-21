# Prepara os clipes do Mini Paulo (o dos vídeos) para o topo da página de resultados.
#
#   python -I motion/paulo-filme/preparar.py
#
# Entrada: os clipes com transparência do vídeo do portal (WebM VP9 com alfa, 1088x1920), que ficam no
# projeto do vídeo, fora deste repositório. Saída: public/paulo/<nome>.mp4 e descanso.webp.
#
# Vídeo com transparência não toca igual em todo navegador (o iPhone não lê o alfa do WebM), então cada
# clipe sai como um MP4 comum "empilhado": em cima a cor, embaixo a máscara em tons de cinza. A página
# junta as duas metades num canvas (src/components/resultados/paulo/videoComAlfa.ts).
import os
import subprocess
import sys

ORIGEM = os.environ.get("ORIGEM", "C:/Users/pc/rios-video/sistema-proprietario/public/paulo")
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.normpath(os.path.join(AQUI, "../../public/paulo"))

# Quadro comum a todos os clipes, em pixels do clipe original: 1240 x 1554 a partir de y = 180, com a
# cabeça a 60% da largura (sobra espaço à esquerda para a mão que gesticula). O que muda de um clipe
# para o outro é onde a cabeça está (centro_x), medido no canal alfa.
LARGURA, ALTURA, TOPO, ANCORA = 1240, 1554, 180, 0.60
MARGEM = 200  # borda transparente dos dois lados, para o recorte poder passar da beirada do clipe
SAIDA_L, SAIDA_A = 576, 720
FPS = 25

CLIPES = [
    # nome,        arquivo, centro_x da cabeça, corte [de, até] em segundos, laço
    ("ola",        "c3", 770, None,       False),  # acena e explica com o dedo erguido
    ("apresenta",  "c1", 708, None,       False),  # mão estendida, falando
    ("joia",       "c4", 654, (0.0, 4.6), False),  # joinha, de perto
    ("encantado",  "c6", 636, None,       False),  # mãos no rosto
    ("descanso",   "c7", 602, None,       True),   # braços cruzados: é o laço de espera
]
EMENDA = 0.4  # segundos em que o fim do laço se desfaz no começo

# O recorte de fundo verde dos clipes deixou a roupa um pouco transparente (alfa de 0,80 a 0,95 na camisa:
# no vídeo do portal não se nota, em cima da foto de um imóvel o fundo apareceria através do Paulo).
# A máscara é firmada: de 0,70 para cima vira opaco; a borda continua macia.
FIRMAR = "format=yuv444p,lutyuv=y='clip((val-26)*255/152,0,255)',format=gray"


def recorte(centro_x: int) -> str:
    x = round(centro_x - ANCORA * LARGURA) + MARGEM
    return (
        f"format=rgba,pad={1088 + 2 * MARGEM}:1920:{MARGEM}:0:color=black@0,"
        f"crop={LARGURA}:{ALTURA}:{x}:{TOPO},scale={SAIDA_L}:{SAIDA_A}:flags=lanczos"
    )


def duracao(caminho: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", caminho],
        capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


os.makedirs(SAIDA, exist_ok=True)
for nome, arquivo, centro_x, corte, laco in CLIPES:
    origem = f"{ORIGEM}/{arquivo}.webm"
    de, ate = corte if corte else (0.0, duracao(origem))
    dur = ate - de
    grafo = (
        f"[0:v]trim={de}:{ate},setpts=PTS-STARTPTS,{recorte(centro_x)},split[c][a];"
        f"[a]alphaextract,{FIRMAR},split[m1][m2];"
        # a cor vai multiplicada pela máscara (por cima de preto): sem isso a borda sai com franja
        f"[c][m1]alphamerge[rgba];"
        f"color=black:s={SAIDA_L}x{SAIDA_A}:r={FPS}[fundo];[fundo][rgba]overlay=shortest=1,format=yuv420p[cor];"
        f"[m2]format=yuv420p[mascara];[cor][mascara]vstack=inputs=2[pilha]"
    )
    final = "[pilha]"
    if laco:
        grafo += (
            f";[pilha]split[p1][p2];[p1]trim=0:{EMENDA},setpts=PTS-STARTPTS[inicio];"
            f"[p2]trim=start={EMENDA},setpts=PTS-STARTPTS[resto];"
            f"[resto][inicio]xfade=transition=fade:duration={EMENDA}:offset={dur - 2 * EMENDA:.3f}[laco]"
        )
        final = "[laco]"
    destino = f"{SAIDA}/{nome}.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", origem,
         "-filter_complex", grafo, "-map", final, "-an",
         "-c:v", "libx264", "-preset", "slow", "-crf", os.environ.get("CRF", "25"), "-pix_fmt", "yuv420p",
         "-r", str(FPS), "-g", str(FPS * 2), "-movflags", "+faststart", destino],
        check=True)
    print(f"{nome}.mp4  {os.path.getsize(destino) / 1024:.0f} KB  {duracao(destino):.2f} s")

# Quadro parado do descanso, com transparência: é o que aparece com "reduzir movimento" e enquanto o
# primeiro clipe não chega.
nome, arquivo, centro_x = "descanso", "c7", 602
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-c:v", "libvpx-vp9", "-ss", str(EMENDA), "-i", f"{ORIGEM}/{arquivo}.webm",
     "-frames:v", "1",
     "-filter_complex", f"[0:v]{recorte(centro_x)},split[c][a];[a]alphaextract,{FIRMAR}[m];[c][m]alphamerge[v]",
     "-map", "[v]", "-c:v", "libwebp", "-quality", "84", f"{SAIDA}/{nome}.webp"],
    check=True)
print(f"{nome}.webp  {os.path.getsize(f'{SAIDA}/{nome}.webp') / 1024:.0f} KB")
sys.exit(0)
