# -*- coding: utf-8 -*-
"""Monta o contrato de gestão da RIOS.

  python montar.py                      grava contrato.html e os PDFs em pdf/
  python montar.py --so-html            só o contrato.html
  python montar.py --conferir <pasta>   também salva uma imagem por página nessa pasta

O texto e o desenho ficam em modelo.html. Este script troca as marcas {{...}} do modelo:
fontes (recursos/fontes), linhas do fundo (as "correntes" do vídeo do portal), o QR do vídeo
(recursos/qr-video.svg) e a capa do vídeo (recursos/video-poster.jpg).
Precisa de Python 3 com o pacote playwright; a impressão usa o Chrome instalado no computador.
"""
import base64
import math
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
REC = os.path.join(AQUI, 'recursos')
MM = 96 / 25.4
TAU = math.pi * 2
TOTAL = 5  # páginas do contrato, sem o anexo

AZUL, AZUL_CLARO, TERRA, TERRA_CLARA = '#1E507A', '#6fb1dc', '#DE5E32', '#F2A27C'


def ler(nome, modo='r'):
    with open(os.path.join(AQUI, nome), modo, **({} if 'b' in modo else {'encoding': 'utf-8'})) as f:
        return f.read()


def b64(caminho):
    return base64.b64encode(ler(caminho, 'rb')).decode('ascii')


def fontes():
    css = []
    for arq in sorted(os.listdir(os.path.join(REC, 'fontes'))):
        m = re.match(r'(baloo-2|mulish)-latin-(\d+)-(normal|italic)\.woff2$', arq)
        if not m:
            continue
        familia = 'Baloo 2' if m.group(1) == 'baloo-2' else 'Mulish'
        css.append(
            "@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:block;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}"
            % (familia, m.group(3), m.group(2), b64(os.path.join('recursos', 'fontes', arq)))
        )
    return '\n'.join(css)


# ---------------------------------------------------------------------------------------------
# As "correntes" do fundo do vídeo (src/Fundo.tsx do projeto do vídeo), paradas num quadro.
# base = altura (fração), a1/a2 = amplitude das duas ondas (px), k = frequência, larg = traço.
# ---------------------------------------------------------------------------------------------
def corrente(base, a1, a2, k1, k2, fase, larg, op, cor, pulso=None):
    return dict(base=base, a1=a1, a2=a2, k1=k1, k2=k2, fase=fase, larg=larg, op=op, cor=cor, pulso=pulso)


PRESETS = {
    # nome: (largura mm, altura mm, fundo claro?, luzes?, correntes)
    'capa': (210, 112, False, True, [
        corrente(.07, 17, 6, .9, 2.2, .3, 1.0, .26, 'azul'),
        corrente(.15, 22, 8, .8, 1.9, 1.4, 1.6, .5, 'terra', .37),
        corrente(.50, 19, 8, 1.1, 2.6, 2.2, 1.0, .22, 'azul'),
        corrente(.63, 22, 7, .7, 2.1, 3.6, 1.8, .52, 'terra', .78),
        corrente(.71, 18, 8, 1.0, 2.4, 4.4, 1.1, .36, 'azul', .56),
        corrente(.82, 20, 6, .9, 1.8, 5.1, 1.3, .34, 'azul'),
        corrente(.92, 14, 7, 1.2, 2.8, .9, 1.0, .26, 'terra'),
    ]),
    # no anexo as correntes ficam no alto e no pé: o meio é do título e do cartão de dados
    'anexo': (210, 72, False, True, [
        corrente(.07, 11, 4, .9, 2.2, 1.1, 1.0, .26, 'azul'),
        corrente(.15, 13, 5, .8, 1.9, 2.6, 1.6, .5, 'terra', .62),
        corrente(.955, 4, 2, .7, 2.1, .6, 1.5, .5, 'terra', .3),
        corrente(.975, 3, 1.5, 1.0, 2.4, 4.4, 1.0, .34, 'azul', .8),
    ]),
    'painel': (176, 86, False, True, [
        corrente(.07, 9, 4, .9, 2.2, .3, .9, .24, 'azul'),
        corrente(.13, 11, 4, .8, 1.9, 4.0, 1.4, .46, 'terra', .56),
        corrente(.87, 10, 4, .7, 2.1, 3.6, 1.5, .5, 'terra', .22),
        corrente(.93, 9, 4, 1.0, 2.4, 1.4, 1.0, .32, 'azul', .7),
    ]),
    'fecho': (176, 25, False, True, [
        corrente(.07, 3, 1.5, .9, 2.2, .3, .9, .26, 'azul'),
        corrente(.15, 3.5, 1.5, .8, 1.9, 1.4, 1.4, .5, 'terra', .6),
        corrente(.88, 3, 1.5, .7, 2.1, 3.6, 1.4, .48, 'terra', .56),
        corrente(.94, 3, 1.5, 1.0, 2.4, 4.4, 1.0, .34, 'azul', .84),
    ]),
    # fios das páginas claras (cabeçalho e rodapé)
    'fio-cab': (210, 7, True, False, [
        corrente(.42, 5.5, 2.2, .9, 2.2, .3, 1.0, .5, 'azul'),
        corrente(.58, 6.5, 2.4, .8, 1.9, 1.9, 1.5, .9, 'terra', .72),
    ]),
    'fio-rod': (210, 6, True, False, [
        corrente(.42, 4.5, 2.0, 1.0, 2.4, 2.9, 1.0, .5, 'azul'),
        corrente(.6, 5.5, 2.0, .7, 2.1, 4.3, 1.4, .85, 'terra', .24),
    ]),
}

_n = [0]


def ondas(nome):
    larg_mm, alt_mm, claro, luzes, correntes = PRESETS[nome]
    W, H = larg_mm * MM, alt_mm * MM
    _n[0] += 1
    p = 'o%d' % _n[0]

    def caminho(c):
        pts = []
        for i in range(97):
            u = i / 96
            x = -20 + u * (W + 40)
            y = c['base'] * H + c['a1'] * math.sin(c['k1'] * TAU * u + c['fase']) + c['a2'] * math.sin(c['k2'] * TAU * u + c['fase'] * 1.7)
            pts.append('%s%.1f,%.1f' % ('M' if i == 0 else 'L', x, y))
        return ' '.join(pts)

    if claro:
        grad = (
            '<linearGradient id="%sA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="%s" stop-opacity=".15"/><stop offset=".5" stop-color="%s" stop-opacity=".75"/><stop offset="1" stop-color="%s"/></linearGradient>'
            '<linearGradient id="%sT" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="%s" stop-opacity=".2"/><stop offset=".5" stop-color="%s" stop-opacity=".85"/><stop offset="1" stop-color="%s"/></linearGradient>'
            % (p, AZUL_CLARO, AZUL_CLARO, AZUL, p, TERRA_CLARA, TERRA, TERRA)
        )
    else:
        grad = (
            '<linearGradient id="%sA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="%s" stop-opacity=".1"/><stop offset=".5" stop-color="%s" stop-opacity=".8"/><stop offset="1" stop-color="#a9d4f0"/></linearGradient>'
            '<linearGradient id="%sT" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="%s" stop-opacity=".1"/><stop offset=".5" stop-color="%s" stop-opacity=".85"/><stop offset="1" stop-color="%s"/></linearGradient>'
            '<radialGradient id="%sbA"><stop offset="0" stop-color="%s" stop-opacity=".22"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sbT"><stop offset="0" stop-color="%s" stop-opacity=".24"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>'
            % (p, AZUL_CLARO, AZUL_CLARO, p, TERRA, TERRA, TERRA_CLARA, p, AZUL_CLARO, AZUL_CLARO, p, TERRA, TERRA)
        )
    partes = ['<svg class="ondas" viewBox="0 0 %.1f %.1f" preserveAspectRatio="none" aria-hidden="true"><defs>%s</defs>' % (W, H, grad)]
    if luzes:
        partes.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="url(#%sbA)"/>' % (W * .84, H * .1, W * .62, H * .6, p))
        partes.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="url(#%sbT)"/>' % (W * .2, H * .95, W * .6, H * .55, p))
    comprimento = W + 40
    for c in correntes:
        d = caminho(c)
        partes.append('<path d="%s" fill="none" stroke="url(#%s%s)" stroke-width="%.2f" stroke-linecap="round" opacity="%.2f"/>' % (d, p, 'A' if c['cor'] == 'azul' else 'T', c['larg'], c['op']))
        if c['pulso'] is not None:
            pos = c['pulso'] * comprimento
            if claro:
                halo, luz = (AZUL_CLARO, AZUL) if c['cor'] == 'azul' else (TERRA_CLARA, TERRA)
                partes.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round" stroke-dasharray="30 9999" stroke-dashoffset="%.1f" opacity=".95"/>' % (d, luz, c['larg'] + 1.1, -pos))
            else:
                halo, luz = ('#cfe8f8', '#e6f3fb') if c['cor'] == 'azul' else (TERRA_CLARA, '#ffd9c2')
                partes.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round" stroke-dasharray="44 9999" stroke-dashoffset="%.1f" opacity=".24"/>' % (d, halo, c['larg'] + 5, -pos + 5))
                partes.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round" stroke-dasharray="34 9999" stroke-dashoffset="%.1f" opacity=".92"/>' % (d, luz, c['larg'] + .7, -pos))
    partes.append('</svg>')
    return ''.join(partes)


def cabecalho():
    return (
        '<div class="cab"><svg class="logo marca" viewBox="0 0 1032 244"><use href="#logo"/></svg>'
        '<span class="titulo">Contrato de gestão</span></div>'
        '<div class="cab-onda">%s</div>' % ondas('fio-cab')
    )


def rodape(n):
    pag = 'Anexo I' if n == 'A' else '%s / %d' % (n, TOTAL)
    return (
        '<div class="rod-onda">%s</div>'
        '<footer class="rod"><span><span class="assina">RIOS</span> · Gestão de imóveis por temporada</span>'
        '%s<span class="pag">%s</span></footer>'
        # rubrica só nas páginas sem assinatura
        % (ondas('fio-rod'), '' if n in ('A', str(TOTAL)) else '<span class="rubricas">Rubricas <i></i><i></i></span>', pag)
    )


def montar():
    html = ler('modelo.html')
    html = html.replace('/*FONTES*/', fontes())
    html = re.sub(r'\{\{ONDAS:([\w-]+)\}\}', lambda m: ondas(m.group(1)), html)
    html = re.sub(r'\{\{CAB\}\}', lambda m: cabecalho(), html)
    html = re.sub(r'\{\{ROD:(\w+)\}\}', lambda m: rodape(m.group(1)), html)
    html = html.replace('{{QR}}', ler(os.path.join('recursos', 'qr-video.svg')))
    html = html.replace('{{POSTER}}', 'data:image/jpeg;base64,' + b64(os.path.join('recursos', 'video-poster.jpg')))
    sobra = re.findall(r'\{\{[^}]+\}\}', html)
    if sobra:
        raise SystemExit('Marca sem troca no modelo: %s' % sobra)
    saida = os.path.join(AQUI, 'contrato.html')
    with open(saida, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('contrato.html  %.0f KB' % (os.path.getsize(saida) / 1024))
    return saida


# Folga entre o fim do texto e o rodapé (ou o fecho) de cada página, em mm. Negativo = estourou.
JS_FOLGA = """() => [...document.querySelectorAll('.pagina')].map((pg, i) => {
  const caixa = pg.querySelector('.conteudo, .conteudo-capa');
  const ultimo = caixa.lastElementChild.getBoundingClientRect().bottom;
  const piso = (pg.querySelector('.fecho') || pg.querySelector('.rod-onda')).getBoundingClientRect().top;
  return {pagina: i + 1, folga_mm: Math.round((piso - ultimo) / (96 / 25.4) * 10) / 10};
})"""

PDFS = (
    ('nao', 'Contrato de Gestao RIOS.pdf'),
    ('so', 'Anexo I - Curadoria decorativa.pdf'),
    ('sim', 'Contrato de Gestao RIOS + Anexo I.pdf'),
)


def imprimir(saida, conferir=None):
    from playwright.sync_api import sync_playwright

    os.makedirs(os.path.join(AQUI, 'pdf'), exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch(channel='chrome')
        pg = nav.new_page(viewport={'width': 1000, 'height': 1300}, device_scale_factor=1.5)
        pg.goto('file:///' + saida.replace('\\', '/'))
        pg.evaluate('document.fonts.ready')
        pg.add_style_tag(content='.barra{display:none!important}')
        pg.evaluate("document.documentElement.setAttribute('data-anexo','sim')")
        for f in pg.evaluate(JS_FOLGA):
            print('  página %(pagina)d: folga de %(folga_mm)s mm' % f + ('   <-- ESTOUROU' if f['folga_mm'] < 0 else ''))
        if conferir:
            os.makedirs(conferir, exist_ok=True)
            paginas = pg.locator('.pagina')
            for i in range(paginas.count()):
                paginas.nth(i).screenshot(path=os.path.join(conferir, 'pagina-%d.png' % (i + 1)))
        for modo, nome in PDFS:
            pg.evaluate("m => document.documentElement.setAttribute('data-anexo', m)", modo)
            destino = os.path.join(AQUI, 'pdf', nome)
            pg.pdf(path=destino, prefer_css_page_size=True, print_background=True)
            print('pdf/%s  %.0f KB' % (nome, os.path.getsize(destino) / 1024))
        nav.close()


if __name__ == '__main__':
    arquivo = montar()
    if '--so-html' not in sys.argv:
        pasta = sys.argv[sys.argv.index('--conferir') + 1] if '--conferir' in sys.argv else None
        imprimir(arquivo, pasta)
