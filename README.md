# Varemi Go

Varemi Go é um MVP **source-available** para acompanhar a compra em mercados pelo navegador móvel:

**QR da loja → scanner web → backend consulta produto/preço autoritativo → carrinho → total atualizado durante a compra.**

O QR identifica somente a loja/unidade. O navegador envia o barcode e intenções do usuário; preço, quantidade persistida e total são calculados no servidor.

## MVP atual

A primeira vertical slice implementa:

- URL de loja demo pronta para ser codificada em QR: `/#/store/demo-market`;
- sessão anônima/pseudônima, sem cadastro;
- credencial de sessão em cookie `HttpOnly` separado do `session_id`;
- scanner web para EAN-13, EAN-8 e UPC-A com entrada manual sempre disponível;
- tratamento de permissão negada, câmera ausente/incompatível, barcode inválido/desconhecido e falha de rede;
- supressão de leituras repetidas no scanner e idempotência server-side para retry de adição;
- provider demo determinístico atrás de contrato interno de catálogo/preço;
- carrinho autoritativo persistido em SQLite;
- adicionar, alterar quantidade, remover, totalizar, expirar e recuperar após refresh;
- proveniência básica de preço;
- testes de domínio, persistência, API, web e E2E mobile/full-stack configurado em Playwright.


Os testes unitários do scanner cobrem apenas helpers puros; o E2E crítico usa entrada manual. A integração ZXing/câmera e **câmera física real não são validadas por CI**. UPC-E fica fora desta slice porque o payload textual de oito dígitos não preserva a symbology necessária para distingui-lo de EAN-8.

Ainda pertencem ao MVP, mas **não estão implementados nesta vertical slice**: finalização explícita, handoff seguro por QR/identificador e recuperação autoritativa do carrinho na estação de checkout.

Fora do MVP inicial: processamento próprio de pagamento, emissão fiscal própria, visão computacional, IA, analytics avançado e automação sofisticada de prevenção de perdas. A sequência é: vertical slice demo → pilot readiness (integração real + baseline + instrumentação/observabilidade mínima + fallback) → piloto → evidência → expansão/refinamentos.

## Arquitetura e desenvolvimento

- [`docs/architecture.md`](docs/architecture.md) — fronteiras e invariantes implementados;
- [`docs/setup.md`](docs/setup.md) — setup e comandos de qualidade;
- [`docs/api.md`](docs/api.md) — endpoints da vertical slice;
- [`docs/integrations/catalog-provider.md`](docs/integrations/catalog-provider.md) — contrato do provider;
- [`docs/adr`](docs/adr) — decisões técnicas;
- [`docs/roadmap.md`](docs/roadmap.md) — MVP vs. futuro.

A cobertura Python falha abaixo de 85%. A lógica web unit-testável também possui threshold de 85%; a integração de UI é coberta pelo Playwright em viewport mobile.

## Fluxo de contribuição

O bootstrap inicial foi criado diretamente em `main`. Mudanças normais posteriores seguem branch + pull request. Consulte [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licença

Varemi Go é publicamente visível, mas **não é open source nesta fase**. O código é licenciado sob Business Source License 1.1 com Additional Use Grant `None`. Uso não produtivo é permitido nos termos da BSL; uso em produção antes da mudança de licença exige licença/autorização aplicável. Na Change Date, a versão correspondente passa à Change License definida no [`LICENSE`](LICENSE), nos termos da própria BSL.

A licença do código não concede direitos sobre a marca Varemi ou Varemi Go. Consulte [`docs/licensing.md`](docs/licensing.md).
