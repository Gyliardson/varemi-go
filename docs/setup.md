# Setup local

## Pré-requisitos

- Python 3.13
- Node.js 24 LTS (>=24, <25)
- npm

## Instalação

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
npm install
cp .env.example .env
```

Em terminais separados:

```bash
uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
npm run web:dev
```

Abra `http://127.0.0.1:5173/#/store/demo-market`. Esse é o target de URL que um QR da loja demo deve codificar; o QR não contém secret ou preço.

Produtos demo:

| GTIN | Produto | Preço demo |
| --- | --- | ---: |
| `7890000000017` | Arroz Demo 1 kg | R$ 27,99 |
| `7890000000024` | Leite Demo 1 L | R$ 6,49 |
| `7890000000031` | Café Demo 500 g | R$ 18,90 |

## Qualidade

```bash
ruff format --check .
ruff check .
mypy
pytest
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npx playwright install chromium
npm run e2e
```

O Playwright sobe API e Vite automaticamente, usa Chromium em viewport/touch mobile e cobre o fluxo crítico por entrada manual. Isso não constitui validação de câmera física.

## HTTPS

A câmera web normalmente depende de secure context. Em qualquer ambiente HTTPS compartilhado, configure `VAREMI_SECURE_COOKIES=1`. O valor `0` existe somente para desenvolvimento local em HTTP.
