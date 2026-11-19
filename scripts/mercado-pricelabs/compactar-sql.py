#!/usr/bin/env python3
"""Compacta os `mercado-N.sql` do carregar-do-mcp.mjs e calcula a soma de verificação da carga.

Quem aplica a carga pelo `query_database` do Lovable precisa colar o SQL inteiro na chamada.
Os arquivos originais somam ~64 KB; aqui os imóveis do mesmo endereço compartilham o bloco de
dados e as partes sempre nulas saem dos vetores (~33 KB em quatro arquivos `compacto-N.sql`).

O script também imprime o md5 esperado. Depois de aplicar, rode no banco:

    select count(*), md5(string_agg(listing_id || '|' || categoria || '|' || to_char(mes::date, 'YYYY-MM-DD') || '|'
      || coalesce(round(ocupacao * 10000)::int::text, '') || '|' || coalesce(round(ocupacao_ano_anterior * 10000)::int::text, '') || '|'
      || coalesce(diaria_cents::text, '') || '|' || coalesce(preco_mediano_cents::text, '') || '|' || listagens::text || '|' || origem,
      ';' order by listing_id collate "C", categoria collate "C", mes))
    from mercado_mensal where synced_at > now() - interval '45 minutes';

A contagem e o md5 têm que ser os impressos aqui: é a prova de que nenhum número foi trocado
ao colar. Se não baterem, reaplique o arquivo (é upsert) e confira de novo.

Uso:
    python -I compactar-sql.py <pasta-com-mercado-N.sql> <pasta-de-saida>
"""
import glob
import hashlib
import os
import re
import sys

if len(sys.argv) != 3:
    sys.exit(__doc__)
pasta, saida = sys.argv[1:3]
BLOCOS_POR_ARQUIVO = 11
PADRAO = re.compile(
    r"\('([^']*)','([^']*)','([^']*)','([^']*)',(\d+),'([^']*)','([^']*)',"
    r"'\{([^}]*)\}','\{([^}]*)\}','\{([^}]*)\}','\{([^}]*)\}','\{([^}]*)\}'\)"
)

registros = []
for arquivo in sorted(glob.glob(os.path.join(pasta, "mercado-*.sql"))):
    for m in PADRAO.finditer(open(arquivo, encoding="utf-8").read()):
        listing, pid, cat, m0, k, hist, fut, n, oc, oa, di, pm = m.groups()
        registros.append(dict(listing=listing, pid=pid, cat=cat, m0=m0, k=int(k), hist=hist, fut=fut,
                              n=n.split(","), oc=oc.split(","), oa=oa.split(","), di=di.split(","), pm=pm.split(",")))
if not registros:
    sys.exit(f"nenhum registro em {pasta}")

# O formato compacto supõe o que o parser sempre devolveu até hoje; se mudar, para aqui.
blocos = {}
alvos = []
for r in registros:
    k, total = r["k"], len(r["oc"])
    assert r["hist"] == "historico" and r["fut"] == "futuro", r["listing"]
    assert len(set(r["n"])) == 1, f"listagens variam em {r['listing']}"
    assert all(len(r[c]) == total for c in ("n", "oa", "di", "pm")), r["listing"]
    assert all(v == "NULL" for v in r["oa"][:k]), f"ano anterior no histórico: {r['listing']}"
    assert all(v == "NULL" for v in r["di"][k:]), f"diária no futuro: {r['listing']}"
    assert all(v == "NULL" for v in r["pm"][:k]), f"preço mediano no histórico: {r['listing']}"
    chave = (r["m0"], k, r["n"][0], ",".join(r["oc"]), ",".join(r["di"][:k]), ",".join(r["oa"][k:]), ",".join(r["pm"][k:]))
    blocos.setdefault(chave, f"b{len(blocos) + 1}")
    alvos.append((r["listing"], r["pid"], r["cat"], blocos[chave]))


def meses(m0, total):
    ano, mes = int(m0[:4]), int(m0[5:7])
    for i in range(total):
        t = ano * 12 + (mes - 1) + i
        yield f"{t // 12:04d}-{t % 12 + 1:02d}-01"


def inteiro(valor, fator=1):
    return "" if valor == "NULL" else str(round(float(valor) * fator))


linhas = []
for r in registros:
    for i, mes in enumerate(meses(r["m0"], len(r["oc"]))):
        origem = "historico" if i < r["k"] else "futuro"
        linhas.append("|".join([r["listing"], r["cat"], mes, inteiro(r["oc"][i], 10000), inteiro(r["oa"][i], 10000),
                                inteiro(r["di"][i]), inteiro(r["pm"][i]), r["n"][i], origem]))
linhas.sort()
print(f"{len(registros)} registros, {len(blocos)} blocos distintos, {len(linhas)} linhas")
print("md5 esperado:", hashlib.md5(";".join(linhas).encode()).hexdigest())

CAUDA = """
insert into public.mercado_mensal (listing_id, pms, property_id, categoria, mes, ocupacao, ocupacao_ano_anterior, diaria_cents, preco_mediano_cents, listagens, origem)
select a.listing, 'hostex', a.pid::uuid, a.cat, (bl.m0::date + make_interval(months => (u.i - 1)::int))::date, u.oc,
  case when u.i > bl.k then (bl.oa::numeric[])[u.i - bl.k] end,
  case when u.i <= bl.k then (bl.di::int[])[u.i] end,
  case when u.i > bl.k then (bl.pm::int[])[u.i - bl.k] end,
  bl.n, case when u.i <= bl.k then 'historico' else 'futuro' end
from alvo a join blocos bl on bl.b = a.b
cross join lateral unnest(bl.oc::numeric[]) with ordinality as u(oc, i)
on conflict (listing_id, categoria, mes) do update set property_id = excluded.property_id, ocupacao = excluded.ocupacao, ocupacao_ano_anterior = excluded.ocupacao_ano_anterior, diaria_cents = excluded.diaria_cents, preco_mediano_cents = excluded.preco_mediano_cents, listagens = excluded.listagens, origem = excluded.origem, synced_at = now();"""

os.makedirs(saida, exist_ok=True)
itens = list(blocos.items())
for parte, inicio in enumerate(range(0, len(itens), BLOCOS_POR_ARQUIVO), 1):
    fatia = itens[inicio:inicio + BLOCOS_POR_ARQUIVO]
    ids = {b for _, b in fatia}
    sql = "with blocos(b, m0, k, n, oc, di, oa, pm) as (values\n"
    sql += ",\n".join(f"('{b}','{c[0]}',{c[1]},{c[2]},'{{{c[3]}}}','{{{c[4]}}}','{{{c[5]}}}','{{{c[6]}}}')" for c, b in fatia)
    sql += "\n), alvo(listing, pid, cat, b) as (values\n"
    sql += ",\n".join(f"('{l}','{pid}','{cat}','{b}')" for l, pid, cat, b in alvos if b in ids)
    sql += "\n)" + CAUDA
    nome = os.path.join(saida, f"compacto-{parte}.sql")
    open(nome, "w", encoding="utf-8").write(sql)
    print(f"{os.path.basename(nome)}: {len(fatia)} blocos, {sum(1 for a in alvos if a[3] in ids)} registros, {len(sql)} bytes")
