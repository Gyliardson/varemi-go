# Security Policy

## Versões suportadas

Enquanto o projeto está em MVP, apenas o estado atual da branch `main` é considerado suportado para correções de segurança.

## Reporte responsável

Prefira o recurso **Private vulnerability reporting** do GitHub quando estiver habilitado neste repositório. Não publique secrets, tokens, PII, dados de cartão, dados de clientes ou um exploit funcional em issue/PR público.

Se o reporte privado ainda não estiver habilitado, use somente um canal privado publicado pelo maintainer em seu perfil/organização; não inclua detalhes sensíveis em um canal público enquanto esse canal não existir.

## Princípios do projeto

- cliente nunca é autoridade para preço, desconto, total, tenant, autorização ou estado de pagamento;
- ID de recurso não é autorização;
- tokens de sessão não são persistidos em claro no servidor nem escritos em logs;
- integrações devem falhar explicitamente em vez de fabricar preço atual;
- migrations e operações de carrinho devem preservar integridade e concorrência;
- nenhuma credencial real de varejista deve entrar neste repositório público.
