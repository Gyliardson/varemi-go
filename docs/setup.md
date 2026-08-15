# Setup local

## Pré-requisitos

- Python 3.13
- Node.js 24 LTS (>=24, <25)
- npm

## API

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

## Web

```bash
npm install
npm run web:dev
```

Abra a loja demo em `http://127.0.0.1:5173/#/store/demo-market` após a vertical slice ser aplicada.

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
```

O E2E usa Playwright e inicia API + web localmente; consulte `playwright.config.js` após a vertical slice.
