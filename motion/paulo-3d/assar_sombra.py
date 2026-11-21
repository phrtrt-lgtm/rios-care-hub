# Assa a sombra das dobras (oclusão de ambiente) na textura de cor do Mini Paulo, no Blender.
#
#   blender -b --factory-startup -P assar_sombra.py -- <modelo.glb> <saida.png> [força=0.6] [alcance=0.07] [amostras=48]
#
# A textura do Tripo vem "sem luz": só a cor. Na página a luz é simples (para rodar em celular), então
# o volume das dobras, do queixo e do vinco da roupa vem pintado na própria textura. O resultado é a cor
# original multiplicada pela sombra, no mesmo desenho de UV: o empacotar.mjs usa no lugar da original.
#
# O alcance é curto de propósito. A sombra é assada com os braços abaixados, e o boneco se mexe: com
# alcance longo, o lado do tronco onde o braço encostava ficaria manchado quando ele ergue os braços.
#
# A parte demorada (uns 4 minutos) fica guardada ao lado da saída (-bruta.npy): mudar só a força não
# assa de novo.
import os
import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
modelo, saida = args[0], args[1]
forca = float(args[2]) if len(args) > 2 else 0.6
alcance = float(args[3]) if len(args) > 3 else 0.07
amostras = int(args[4]) if len(args) > 4 else 48

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=modelo)

malha = next(o for o in bpy.context.scene.objects if o.type == "MESH")
nos = malha.active_material.node_tree.nodes

# a textura de cor é a que entra em "Base Color" do nó principal
principal = next(n for n in nos if n.type == "BSDF_PRINCIPLED")
cor = principal.inputs["Base Color"].links[0].from_node.image
largura, altura = cor.size
print("textura de cor:", cor.name, largura, "x", altura)

# Fora das ilhas de UV nada é assado. Para saber onde é "fora" (e não "sombra total", que também dá
# zero), a imagem nasce com um valor impossível e o forno não a limpa antes.
FORA = 2.0
bruta = "%s-bruta-%s.npy" % (saida[:-4], str(alcance).replace(".", "_"))
if os.path.exists(bruta):
    sombra = np.load(bruta)
else:
    alvo = bpy.data.images.new("sombra", largura, altura, alpha=False, float_buffer=True)
    alvo.colorspace_settings.name = "Non-Color"
    alvo.pixels = np.full(largura * altura * 4, FORA, dtype=np.float32)
    no_alvo = nos.new("ShaderNodeTexImage")
    no_alvo.image = alvo
    nos.active = no_alvo

    cena = bpy.context.scene
    cena.render.engine = "CYCLES"
    cena.cycles.device = "CPU"
    cena.cycles.samples = amostras
    cena.render.bake.margin = 12
    cena.render.bake.use_clear = False
    cena.world = bpy.data.worlds.new("mundo")
    cena.world.light_settings.distance = alcance

    bpy.ops.object.select_all(action="DESELECT")
    malha.select_set(True)
    bpy.context.view_layer.objects.active = malha
    bpy.ops.object.bake(type="AO")
    sombra = np.array(alvo.pixels[:], dtype=np.float32).reshape(altura, largura, 4)[:, :, 0]
    np.save(bruta, sombra)

fora = sombra > 1.5
pintado = sombra[~fora]
# o tom de uma superfície aberta vira "sem sombra"; só o que fica abaixo dele escurece
aberto = float(np.percentile(pintado, 75))
print("pintado: %.0f%% da textura; superfície aberta %.2f; média %.2f" % (100 * pintado.size / sombra.size, aberto, float(pintado.mean())))
sombra = np.clip(sombra / max(1e-3, aberto), 0.0, 1.0)
fator = 1.0 - forca * (1.0 - sombra)
fator[fora] = 1.0

base = np.array(cor.pixels[:], dtype=np.float32).reshape(altura, largura, 4)
base[:, :, :3] *= fator[:, :, None]

final = bpy.data.images.new("cor-com-sombra", largura, altura, alpha=False)
final.pixels = base.ravel()
final.filepath_raw = saida
final.file_format = "PNG"
final.save()
print("gravado", saida)
