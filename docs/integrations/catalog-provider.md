# Contrato de catálogo/preço

A vertical slice define um contrato interno pequeno para responder, por `store_id` + barcode/GTIN, um quote contendo:

- identidade interna do produto;
- barcode consultado;
- nome de exibição;
- preço unitário em centavos de BRL;
- promoção opcional apenas quando necessária para apresentar o preço atual;
- fonte/proveniência;
- instante efetivo/observado suficiente para explicar o preço.

O provider demo é determinístico e não representa um ERP real. Adapters de varejistas futuros devem implementar o mesmo papel sem infiltrar detalhes de fornecedor no domínio.

Falha ou indisponibilidade do provider deve virar erro explícito. O sistema não deve reapresentar um preço antigo como atual sem uma política de cache formal e testada.
