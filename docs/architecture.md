# Arquitetura inicial

## Objetivo

Manter um MVP pequeno sem misturar autoridade comercial, persistência e UI.

```text
apps/web (mobile web, não confiável)
        |
        | HTTPS/JSON
        v
apps/api / varemi_go.api
        |
        +--> varemi_go.domain
        +--> varemi_go.persistence (SQLite no demo)
        +--> varemi_go.catalog (contrato + provider demo)
```

## Fronteiras

- **Web**: captura barcode e intenções do usuário; nunca envia preço/total autoritativo.
- **API**: autentica a sessão, valida input, coordena provider + carrinho e retorna estado calculado pelo servidor.
- **Domínio**: normalização, regras de carrinho, valores monetários em centavos e estados explícitos.
- **Persistência**: SQLite no MVP, com migrations SQL e transações; não contém regras de ERP.
- **Catalog provider**: contrato interno para obter produto/preço por loja e barcode. O demo é determinístico; integração real será um adapter posterior.

## Multi-store sem SaaS prematuro

A sessão sempre pertence a uma `store_id`. O provider recebe contexto de loja. O MVP possui uma loja demo, mas não existe singleton global de preço/carrinho que impeça múltiplas lojas posteriormente.

## Segurança transacional

- ID da sessão não autoriza acesso: uma credencial aleatória independente é exigida e armazenada apenas como hash no servidor.
- preços/totais são calculados no servidor;
- mutações de scan usam chave de idempotência para retries;
- quantidades e totais usam inteiros, nunca ponto flutuante;
- expiração é verificada pelo servidor;
- logs não devem registrar Authorization, tokens, secrets ou PII desnecessária.
