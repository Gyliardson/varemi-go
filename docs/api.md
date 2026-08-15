# API da vertical slice

A especificação OpenAPI é gerada pelo FastAPI. Endpoints atuais:

| Método | Rota | Papel |
| --- | --- | --- |
| `GET` | `/api/health` | health check |
| `GET` | `/api/stores/{slug}` | resolve a loja pública |
| `POST` | `/api/stores/{slug}/sessions` | cria sessão/carrinho e cookie HttpOnly |
| `GET` | `/api/sessions/{id}` | recupera carrinho autoritativo |
| `POST` | `/api/sessions/{id}/items` | resolve replay idempotente ou consulta provider e adiciona barcode |
| `PATCH` | `/api/sessions/{id}/items/{barcode}` | define quantidade positiva |
| `DELETE` | `/api/sessions/{id}/items/{barcode}` | remove item |

`POST .../items` exige `Idempotency-Key` e body com `barcode`. Os modelos de request rejeitam campos extras. Nenhum endpoint aceita preço ou total como autoridade do cliente.

Um replay já commitado da mesma `Idempotency-Key` + mesmo barcode é resolvido pelo estado persistido sem nova consulta ao provider; a checagem é repetida atomicamente na transação de `add_item` para proteger races. Reuso da chave com payload diferente retorna 409.

Erros de API usam um único wire contract, também refletido no OpenAPI:

```json
{
  "code": "CART_EXPIRED",
  "message": "Cart session has expired"
}
```

Isso vale para erros de domínio/autorização e para validação 422 (`VALIDATION_ERROR`). Códigos relevantes incluem `STORE_NOT_FOUND`, `SESSION_UNAUTHORIZED`, `SESSION_NOT_FOUND`, `CART_EXPIRED`, `INVALID_BARCODE`, `PRODUCT_NOT_FOUND`, `ITEM_NOT_FOUND` e `IDEMPOTENCY_KEY_REUSED`.

O cookie web é uma forma de transportar a credencial pseudônima; o contrato de domínio/persistência não depende de cookie ou navegador.
