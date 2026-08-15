# Roadmap

## 1. Vertical slice demo — implementado

- QR/URL da loja demo;
- sessão anônima/pseudônima com credencial separada do resource ID;
- scanner mobile web para EAN-13, EAN-8 e UPC-A, além de entrada manual;
- consulta autoritativa de produto/preço via provider demo;
- carrinho persistido, idempotência e total autoritativo durante a compra;
- recuperação de sessão encerrada no browser e fallback operacional para checkout tradicional.

Esta slice demonstra o núcleo scan → preço autoritativo → carrinho. Ela ainda não implementa finalização nem handoff de checkout.

## 2. Pilot readiness — ainda parte do MVP

Antes do piloto, completar e validar:

- finalização explícita do carrinho;
- handoff seguro por QR/identificador;
- recuperação autoritativa do carrinho pela estação de checkout;
- integração real de catálogo/preço do primeiro varejista atrás do contrato de provider;
- baseline do checkout atual;
- instrumentação/observabilidade mínima para medir o piloto e investigar falhas;
- fallback operacional testado.

## 3. Piloto → evidência → expansão/refinamentos

Executar o piloto controlado, medir os resultados contra o baseline e somente então decidir refinamentos/expansão com base em evidência.

## Fora do MVP inicial

- processamento próprio de pagamento;
- emissão fiscal própria;
- visão computacional;
- IA/Varemi AI;
- analytics avançado/Varemi Insights;
- prevenção de perdas automatizada;
- app nativo.

Produtos pesáveis e validações operacionais entram conforme a integração real do piloto exigir, sem pressupor formato universal. Nenhuma capacidade pendente ou futura deve ser apresentada como disponível hoje.
