# ADR 0001 — Stack inicial

- Status: Accepted
- Date: 2026-08-15

## Contexto

O MVP é uma única experiência mobile web com API autoritativa, persistência local/demo e uma integração de catálogo/preço. O objetivo é reduzir peças operacionais sem acoplar domínio à UI ou a um ERP.

Foram avaliados um full-stack React/Next.js, SPA React/Vite + API Node/Fastify e uma UI web deliberadamente pequena + API Python/FastAPI.

## Decisão

- **Web:** JavaScript moderno sem framework de UI no primeiro slice, empacotado/servido por Vite quando necessário.
- **Scanner:** `@zxing/browser` atrás de um módulo de UI; entrada manual sempre disponível.
- **API:** Python 3.13 + FastAPI, com modelos/validação explícitos.
- **Persistência demo:** `sqlite3` da biblioteca padrão com migrations SQL.
- **Testes:** pytest para domínio/API/persistência; Vitest para módulos web; Playwright para full-stack E2E e acessibilidade.

## Motivos

A tela inicial é pequena o suficiente para não justificar um framework de UI; isso reduz JavaScript, dependências e abstrações. FastAPI fornece contratos OpenAPI e validação por tipos sem impor ORM. SQLite é apropriado para desenvolvimento/demo e a fronteira de persistência permite migrar posteriormente sem tornar o domínio dependente do banco.

Next.js foi evitado porque SSR/RSC/BFF não protegem um risco atual do MVP. Um stack Node/Fastify seria viável, mas adicionaria uma dependência SQLite nativa ou uma camada de ORM sem benefício comprovado para este slice.

## Consequências

O frontend e backend usam linguagens diferentes. O contrato HTTP deve permanecer explícito; geração de cliente a partir de OpenAPI pode ser adicionada somente quando reduzir risco real de drift.
