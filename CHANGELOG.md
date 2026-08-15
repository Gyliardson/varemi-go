# Changelog

Todas as mudanças relevantes serão documentadas aqui.

## Unreleased

### Added

- bootstrap inicial do repositório, qualidade, CI, documentação e política source-available;
- primeira vertical slice mobile web com loja demo, sessão pseudônima, provider autoritativo e carrinho persistido;
- scanner ZXing com fallback manual e tratamento de falhas;
- idempotência de add, expiração e recuperação do carrinho;
- testes backend com threshold de 85% e E2E crítico Playwright configurado.

### Security

- token de sessão persistido somente como hash no banco e transportado no browser por cookie `HttpOnly`/`SameSite=Strict` com path por sessão.
