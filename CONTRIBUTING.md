# Contribuindo

## Situação atual

O repositório é publicamente visível para transparência técnica, mas o projeto ainda não formalizou uma política de cessão/licenciamento de propriedade intelectual para contribuições externas.

Por isso, **não estamos aceitando contribuições externas de código automaticamente nesta fase**. Pull requests não solicitados podem ser fechados sem incorporação até que uma política comercial/IP (por exemplo, CLA ou outra abordagem, se adotada) seja formalmente definida.

Relatos de bugs e feedback técnico podem ser úteis, desde que não incluam secrets, PII, dados de clientes ou detalhes de vulnerabilidades que devam ser tratados de forma privada.

## Fluxo dos maintainers

Após o bootstrap inicial:

1. criar branch focada;
2. manter mudanças pequenas e coerentes;
3. adicionar/ajustar testes antes de declarar comportamento pronto;
4. executar format, lint, typecheck, testes, build e gates de risco aplicáveis;
5. abrir PR com causa/objetivo, implementação, testes, riscos e pendências;
6. não mergear com check obrigatório falhando ou pendente;
7. não fazer release/deploy/tag sem aprovação explícita.

Commits devem ser claros e imperativos, preferencialmente no padrão `tipo(escopo): descrição` quando aplicável.
