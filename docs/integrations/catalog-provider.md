# Contrato de catálogo/preço

`CatalogProvider.get_quote(store, barcode)` responde um quote contendo:

- identidade interna do produto;
- barcode/GTIN normalizado consultado;
- nome de exibição;
- preço unitário em centavos de BRL;
- promoção opcional necessária à apresentação do preço atual;
- `price_source`/proveniência;
- `price_effective_at`.

O `DemoCatalogProvider` é determinístico e não representa ERP, estoque ou disponibilidade reais. Um adapter do primeiro varejista deve implementar essa mesma responsabilidade sem introduzir tipos/configuração do fornecedor no domínio.

## Semântica de falha

Barcode não encontrado gera erro explícito. Esta slice não possui cache: indisponibilidade futura de um provider real não poderá ser mascarada por preço antigo sem ADR/política de stale data e testes correspondentes.

## Mudança de preço

No MVP, um novo add consulta o provider novamente. Para uma linha existente, o quote mais recente substitui o preço/proveniência da linha inteira antes do incremento. A regra é simples e explícita; promoções complexas ou lock de preço por sessão só devem ser adicionados quando o contrato real do piloto exigir.
