# Arquitetura inicial

## Fluxo

```text
QR/URL da loja
    |
    v
apps/web (mobile web, não confiável)
    |
    | same-origin JSON + cookie HttpOnly da sessão
    v
varemi_go.api (FastAPI)
    |
    +--> varemi_go.domain      GTIN, modelos, total em centavos
    +--> varemi_go.catalog     contrato + DemoCatalogProvider
    +--> varemi_go.persistence SQLite + migration SQL
```

## Fronteiras de autoridade

- **Web:** captura barcode e intenção de adicionar/alterar/remover. Não envia preço, desconto ou total.
- **API:** valida input e credencial de sessão, coordena provider + persistência e serializa o estado autoritativo.
- **Domínio:** normaliza/valida GTIN, representa cart/item/store/quote e calcula line total/total em inteiros.
- **Persistência:** mantém sessão/carrinho, expiração e idempotência sob transações SQLite; não contém lógica de ERP.
- **Catalog provider:** resolve produto e preço por contexto de loja + barcode. O demo é determinístico e a futura integração real entra atrás dessa fronteira.

## Sessão pseudônima

Criar a sessão gera dois identificadores distintos:

1. `session_id`, identificador de recurso que pode permanecer no browser;
2. token aleatório de alta entropia, persistido no banco apenas como SHA-256 e entregue ao browser em cookie `HttpOnly`, `SameSite=Strict`, com path restrito àquela sessão.

O `session_id` sozinho não autoriza leitura nem mutação. A API também aceita Bearer token na fronteira HTTP para clientes não-browser futuros, sem tornar a UI web parte do domínio.

Em HTTPS, `VAREMI_SECURE_COOKIES=1` é obrigatório.

## Persistência e concorrência

SQLite é usado somente como persistência do MVP/demo. A migration cria `stores`, `cart_sessions`, `cart_items` e `idempotency_requests`, com foreign keys e checks de quantidade/preço.

Mutações usam `BEGIN IMMEDIATE`, foreign keys por conexão e `busy_timeout`. Valores monetários são inteiros em centavos de BRL.

A adição por scan exige `Idempotency-Key`. Repetir a mesma chave com o mesmo payload não incrementa novamente; reutilizar a chave para outro payload retorna conflito.

## Política de preço no carrinho

Cada adição consulta novamente o provider. Se o barcode já existe no carrinho e o quote mudou, o MVP reaplica o quote recém-obtido à linha inteira e incrementa a quantidade. Essa política é deliberada e deve ser revisitada com o primeiro varejista, pois promoções/regras reais podem exigir semântica distinta. O response preserva `priceSource` e `priceEffectiveAt`.

Não existe cache de preço nesta slice.

## Multi-store sem SaaS prematuro

A sessão pertence a uma `store_id`; o provider recebe o contexto da store. Existe apenas uma loja demo seedada, mas preço/carrinho não dependem de singleton global de loja. Isolamento multi-tenant completo é requisito antes de múltiplos clientes reais, não uma capacidade reivindicada hoje.

## Falhas e fallback

- câmera não disponível/permitida → entrada manual;
- barcode inválido/desconhecido → erro explícito, sem item inventado;
- falha de rede durante add → browser mantém a mesma idempotency key para retry;
- sessão expirada → HTTP 410 e criação de nova sessão pela UI;
- Varemi Go indisponível → operação da loja continua pelo checkout tradicional.
