# Mercado do PriceLabs sem API key (carga pelo MCP)

A página de resultados mostra a ocupação do mercado em volta de cada imóvel
(tabela `mercado_mensal`). O caminho automático é a function `pricelabs-sync`
com o secret `PRICELABS_API_KEY` (PriceLabs → Settings → API details, sem
custo) e o cron `pricelabs-sync-hourly`. Enquanto não houver chave, a carga é
manual, pelo MCP do PriceLabs, com os scripts desta pasta. Última carga completa:
**2026-11-18** (58 imóveis, 2.183 linhas; a anterior foi em 2026-10-07).

**Refaça todo mês.** Os meses "futuro" guardam o que estava reservado no dia da
carga; depois que o mês fecha esse número fica velho e baixo. A página já ignora
mês fechado que só tem dado "futuro" (`mercadoComparavel` em
`src/lib/resultadosImovel.ts`), então sem carga nova o mercado simplesmente some
do mês que acabou.

## Passo a passo

1. **Baixar as respostas.** No MCP do PriceLabs, `get_listings` (pms `hostex`) dá
   as listagens (`20832_12673118_house`; o número do meio é o
   `hostex_properties.id_hostex`). Chame `get_listing_neighborhood_market` com
   `pms = "hostex"` **uma vez por endereço**: imóveis no mesmo ponto (LUCIA,
   BINO, LÉO…) recebem a mesma resposta, então em 2026-11-18 foram 43 chamadas
   para 58 imóveis. Cada resposta tem de 160 a 550 KB e o cliente a grava num
   arquivo solto, com um carimbo no nome; ela **não diz de qual listagem é**.
   Anote num `mapa.tsv` (`NOME<TAB>carimbo`) qual arquivo é de qual imóvel, na
   ordem das chamadas.
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
3. **Juntar e conferir as respostas:**

   ```bash
   python -I scripts/mercado-pricelabs/organizar-respostas.py mapa.tsv imoveis.json <pasta-dos-arquivos-do-mcp> respostas
   ```

   Copia cada resposta para `respostas/<NOME>.json` e mostra a distância entre o
   ponto da resposta e o do imóvel na Hostex. Longe (mais de ~150 m) quer dizer
   anotação trocada; a exceção é ROGERIO3.
4. **Gerar o SQL** (Node 23.6+, importa `parse.ts` direto):

   ```bash
   node scripts/mercado-pricelabs/carregar-do-mcp.mjs respostas imoveis.json saida --forcar ROGERIO3=ROGERIO3.json
   ```

   Ele liga cada imóvel à resposta mais próxima pelo `lat`/`lng`, imprime por
   imóvel o arquivo usado, a distância e a ocupação de janeiro, e grava
   `saida/mercado-N.sql` (19 listagens por arquivo, ~21 KB).
5. **Aplicar.** Pelo SQL editor, rode cada `mercado-N.sql`. Pelo
   `query_database` (o SQL tem que ser colado inteiro na chamada), compacte antes:

   ```bash
   python -I scripts/mercado-pricelabs/compactar-sql.py saida compacto
   ```

   Sai metade do tamanho (`compacto-N.sql`, ~9 KB cada) e o **md5 esperado**. É
   `upsert` por (listagem, categoria, mês): pode repetir sem duplicar.
6. **Conferir.** Rode no banco a consulta do cabeçalho do `compactar-sql.py`: a
   contagem e o md5 têm que ser os que o script imprimiu. É a prova de que nenhum
   número foi trocado ao colar. Depois:
   `select count(*), count(distinct property_id) from mercado_mensal`.

## O que a carga grava

- Categoria `-1` (listagens vizinhas) para todo imóvel, mais a categoria de
  `properties.mercado_categoria` quando estiver preenchida. É ela que a função
  `resultados_imovel` usa.
- 24 meses fechados como `historico` (ocupação e diária realizadas) e o mês
  atual mais 12 à frente como `futuro` (ocupação já reservada e preço anunciado
  mediano). A janela anda: a carga de 2026-11-18 começa em nov/2024, e as linhas
  de out/2024 ficaram da carga anterior.
- Imóveis no mesmo endereço recebem o mesmo mercado, cada um com o próprio
  `listing_id`.

## Casos conhecidos

- **SUELI**: a vizinhança `-1` dela tem 1 listagem só; `mercado_categoria = '2'`
  (2 quartos, 254 listagens). As categorias 1 e 3 dela ficaram da primeira carga
  e não são atualizadas.
- **ROGERIO3**: o PriceLabs o posiciona a ~1 km do ponto da Hostex; entra com
  `--forcar`.
- **MONICA**: não existe no PriceLabs, fica sem mercado.
- **CLAUDIO**: tem três listagens no PriceLabs (`20785`, `20813` e `20808`, esta
  com o envio de preço desligado); a carga usa a `20785_12673096_house`.
- **GIOVANI 1/2/3, MORINGA, KATIA, CARLOS** (2026-11-18): existem no PriceLabs
  mas não têm imóvel ligado à Hostex no portal; ignorados.
- **Ocupação baixa não é erro.** O mercado realizado de uma vizinhança fica
  entre 5% e 40% fora da alta temporada (CLAUDIO2: 5,4% em agosto, 15,7% em
  outubro, 43,6% em janeiro). É o que o PriceLabs informa para as listagens
  vizinhas, que incluem imóveis parados.
