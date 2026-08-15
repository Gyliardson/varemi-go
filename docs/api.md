# API da vertical slice

A especificação OpenAPI é gerada pelo FastAPI. Endpoints atuais:

| Método | Rota | Papel |
| --- | --- | --- |
| `GET` | `/api/health` | health check |
| `GET` | `/api/stores/{slug}` | resolve a loja pública |
| `POST` | `/api/stores/{slug}/sessions` | cria sessão/carrinho e cookie HttpOnly |
| `GET` | `/api/sessions/{id}` | recupera carrinho autoritativo |
| `POST` | `/api/sessions/{id}/items` | consulta provider e adiciona barcode |
| `PATCH` | `/api/sessions/{id}/items/{barcode}` | define quantidade positiva |
| `DELETE` | `/api/sessions/{id}/items/{barcode}` | remove item |

`POST .../items` exige `Idempotency-Key` e body contendo apenas `barcode`. Nenhum endpoint aceita preço ou total do cliente.

Erros de domínio usam códigos explícitos como `STORE_NOT_FOUND`, `SESSION_UNAUTHORIZED`, `SESSION_NOT_FOUND`, `CART_EXPIRED`, `INVALID_BARCODE`, `PRODUCT_NOT_FOUND`, `ITEM_NOT_FOUND` e `IDEMPOTENCY_KEY_REUSED`.

O cookie web é uma forma de transportar a credencial pseudônima; o contrato de domínio/persistência não depende de cookie ou navegador.
