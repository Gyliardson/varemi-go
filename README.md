# Varemi Go

Varemi Go é um MVP **source-available** para acompanhamento de compra em mercados pelo navegador móvel:

**QR da loja → scanner web → backend consulta produto/preço autoritativo → carrinho → total atualizado durante a compra.**

O cliente não informa preço, desconto ou total ao servidor. O QR identifica a loja/unidade e não carrega secrets nem preços autoritativos.

## Escopo desta branch `main` de bootstrap

O commit inicial estabelece licença, estrutura, qualidade, CI, segurança e documentação. A primeira vertical slice funcional entra em branch + pull request imediatamente após este bootstrap.

O produto-alvo desta fase continua sendo: acesso mobile web por URL/QR, sessão pseudônima, scanner com fallback manual, provider demo determinístico, carrinho autoritativo persistido e total calculado no servidor.

Fora do escopo atual: handoff para PDV, pagamento, emissão fiscal, self-checkout, antifraude avançado, visão computacional, IA, analytics sofisticado e aplicativo nativo.

## Estado do repositório

A branch `main` contém o bootstrap. A primeira vertical slice deve entrar via pull request após o bootstrap, sem merge automático.

## Setup local

Consulte [`docs/setup.md`](docs/setup.md).

## Arquitetura

Consulte [`docs/architecture.md`](docs/architecture.md), os ADRs em [`docs/adr`](docs/adr) e o contrato do provider em [`docs/integrations/catalog-provider.md`](docs/integrations/catalog-provider.md).

## Licença

Varemi Go é publicamente visível, mas **não é open source nesta fase**. O código é licenciado sob Business Source License 1.1 com Additional Use Grant `None`. Uso não produtivo é permitido nos termos da BSL; uso em produção exige a licença/autorização aplicável. Na Change Date, a versão correspondente passa à Change License definida no arquivo [`LICENSE`](LICENSE), conforme os próprios termos da BSL.

A licença do código não concede direitos sobre a marca Varemi ou Varemi Go. Consulte [`docs/licensing.md`](docs/licensing.md).
