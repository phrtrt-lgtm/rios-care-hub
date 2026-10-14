# Monta o reel de imóveis para a landing de captação: trechos curtos, cortados
# para 4:5, com fusão entre eles. Saída em dois tamanhos (desktop e celular).
import subprocess, sys, os
D = r"C:\Users\pc\Downloads"
# (arquivo, inicio, duracao)
CLIPES = [
    # Só imóveis decorados pela RIOS (curadoria) e a praia do Forte (pedido do gestor, 2026-10-14).
    ("kXSyZZdo3ewW2lTvtaXK-A.mp4", 0.3, 4.0),                                   # praia do Forte do alto
    ("RIOS_Reel_TourCompleto_1.mp4", 0.4, 2.9),                                 # tour: sala de jantar com vista
    ("hf_20260822_175207_4a39c78b-5118-44d8-9dc9-cb0566cf2585.mp4", 0.5, 4.5),  # curadoria: sala com vista
    ("RIOS_Reel_TourCompleto_1.mp4", 3.9, 2.9),                                 # tour: sala de estar
    ("hf_20260824_203026_86508868-7aa5-40df-b7f0-7d36e8200347.mp4", 0.3, 4.0),  # curadoria: cozinha
    ("hf_20260822_180609_5ffffbf2-11ad-4555-8ca4-d6f2098a2c00.mp4", 0.5, 4.5),  # curadoria: sala de jantar
    ("RIOS_Reel_TourCompleto_1.mp4", 11.0, 2.9),                                # tour: quarto
    ("hf_20260822_184156_3290ea83-1039-4cbb-a65c-4786aa9ad8b2.mp4", 0.5, 4.5),  # curadoria: sala com varanda
    ("QLCg-xbnO3GxnlfNcl5-1A.mp4", 0.3, 4.0),                                   # praia do Forte, outro ângulo
]
FUSAO = 0.6
FPS = 24

def montar(w, h, saida, crf):
    args = ["ffmpeg", "-v", "error", "-y"]
    for arq, ini, dur in CLIPES:
        args += ["-ss", str(ini), "-t", str(dur), "-i", os.path.join(D, arq)]
    fc = []
    for i, (_, _, dur) in enumerate(CLIPES):
        fc.append(f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={FPS},setsar=1,setpts=PTS-STARTPTS,format=yuv420p[v{i}]")
    atual = "v0"; off = 0.0
    for i in range(1, len(CLIPES)):
        off += CLIPES[i-1][2] - FUSAO
        prox = f"x{i}"
        fc.append(f"[{atual}][v{i}]xfade=transition=fade:duration={FUSAO}:offset={off:.3f}[{prox}]")
        atual = prox
    args += ["-filter_complex", ";".join(fc), "-map", f"[{atual}]", "-an",
             "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", saida]
    subprocess.run(args, check=True)
    print(saida, os.path.getsize(saida) // 1024, "KB")

montar(640, 800, "imoveis-640.mp4", 30)
montar(432, 540, "imoveis-432.mp4", 31)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", "imoveis-640.mp4", "-frames:v", "1", "-q:v", "7", "imoveis-poster.jpg"], check=True)
print("poster", os.path.getsize("imoveis-poster.jpg") // 1024, "KB")
total = sum(c[2] for c in CLIPES) - FUSAO * (len(CLIPES) - 1)
print("duracao prevista", round(total, 1), "s")
