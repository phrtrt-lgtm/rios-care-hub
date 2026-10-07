# Mercado do PriceLabs sem API key (carga pelo MCP)

A página de resultados mostra a ocupação do mercado em volta de cada imóvel
(tabela `mercado_mensal`). O caminho automático é a function `pricelabs-sync`
com o secret `PRICELABS_API_KEY` (PriceLabs → Settings → API details, sem
custo) e o cron `pricelabs-sync-hourly`. Enquanto não houver chave, a carga é
manual, pelo MCP do PriceLabs, com este script. Última carga completa:
**2026-10-07** (54 imóveis; os meses "futuro" envelhecem, refaça quando pedirem).

## Passo a passo

1. **Baixar as respostas.** No MCP do PriceLabs, `get_listings` dá as
   listagens (`20832_12673118_house`; o número do meio é o
   `hostex_properties.id_hostex`). Para cada uma, chame
   `get_listing_neighborhood_market` com `pms = "hostex"`. A resposta tem
   ~200 KB e cai em arquivo; junte todas numa pasta (`.json` ou `.txt`).
   A resposta **não diz de qual listagem é**: o script liga pelo `lat`/`lng`.
2. **Gerar `imoveis.json`** no banco (Lovable `query_database` ou SQL editor):

   ```sql
   select json_agg(json_build_object(
     'nome', h.name, 'property_id', h.property_id, 'listing_id', m.listing_id,
     'lat', (h.raw->>'latitude')::numeric, 'lng', (h.raw->>'longitude')::numeric,
     'categoria', p.mercado_categoria) order by h.name)
   from hostex_properties h
   join properties p on p.id = h.property_id
   left join (select distinct property_id, listing_id from mercado_mensal) m on m.property_id = h.property_id;
   ```

   Imóvel novo vem sem `listing_id`: preencha à mão com o id de `get_listings`.
3. **Rodar** (Node 23.6+, importa `parse.ts` direto):

   ```bash
   node scripts/mercado-pricelabs/carregar-do-mcp.mjs <pasta-json> imoveis.json saida
   ```

   Ele imprime, por imóvel, o arquivo usado, a distância e a ocupação de
   janeiro, e grava `saida/mercado-N.sql` (19 listagens por arquivo, ~21 KB).
   Se um imóvel ficar sem resposta perto (o PriceLabs posiciona ROGERIO3 a
   ~1 km do ponto da Hostex), aponte o arquivo: `--forcar ROGERIO3=arquivo.txt`.
4. **Aplicar** cada `mercado-N.sql` no banco. É `upsert` por
   (listagem, categoria, mês): pode repetir sem duplicar.
5. **Conferir:** `select count(*), count(distinct property_id) from mercado_mensal`.

## O que o script grava

- Categoria `-1` (listagens vizinhas) para todo imóvel, mais a categoria de
  `properties.mercado_categoria` quando estiver preenchida. É ela que a função
  `resultados_imovel` usa.
- Meses de out/2024 ao mês atual como `historico` (ocupação e diária
  realizadas) e 13 meses à frente como `futuro` (ocupação já reservada e preço
  anunciado mediano).
- Imóveis no mesmo endereço (LUCIA, BINO, LÉO…) recebem o mesmo mercado, cada
  um com o próprio `listing_id`.

## Casos conhecidos

- **SUELI**: a vizinhança `-1` dela tem 1 listagem só; `mercado_categoria = '2'`
  (2 quartos, 251 listagens).
- **MONICA**: não existe no PriceLabs, fica sem mercado.
- **GIOVANI 1/2/3**: existem no PriceLabs mas não no portal; ignorados.
