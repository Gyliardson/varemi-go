# ADR 0003 — Scanner de barcode no mobile web

- Status: Accepted
- Date: 2026-08-15

## Contexto

O browser precisa ler códigos comuns de varejo sem app nativo, mas a câmera não pode ser o único caminho de entrada. A implementação deve evitar afirmar compatibilidade que a plataforma não garante.

A `BarcodeDetector` API padronizada pelo Shape Detection API continua marcada como experimental/limited availability e depende da plataforma/browser. A especificação expõe descoberta de formatos suportados, o que confirma que suporte não deve ser presumido uniformemente.

`@zxing/browser` fornece readers para vídeo/webcam em browser e permite restringir formatos por hints.

## Decisão

Usar `@zxing/browser` para a primeira implementação de câmera, configurado para:

- EAN-13;
- EAN-8;
- UPC-A.

UPC-E não é habilitado nesta slice. O callback atual transporta somente o texto lido; um UPC-E de oito dígitos ficaria indistinguível de EAN-8 no backend. Suporte futuro exige preservar a symbology e canonicalizar UPC-E para a identidade GTIN-12 correspondente antes de fazer claim de suporte.

O backend aceita GTIN-8/12/13/14 válidos e o provider decide se existe produto para aquele código. Entrada manual permanece sempre visível.

Leituras idênticas muito próximas são suprimidas no cliente para UX; integridade de retry continua protegida por idempotência no servidor.

## Falhas obrigatórias

A UI distingue/faz fallback para permissão negada, câmera ausente e erro/compatibilidade genérica. Barcode inválido/desconhecido e rede são tratados na camada API/UI.

CI cobre helpers puros do scanner e o fluxo E2E por entrada manual. A integração ZXing/câmera não é simulada como se fosse cobertura real, e testes automatizados não serão descritos como validação de câmera física.

## Referências primárias

- WICG Shape Detection API / Barcode Detection: https://wicg.github.io/shape-detection-api/#barcode-detection-api
- MDN BarcodeDetector compatibility/status: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- ZXing browser repository: https://github.com/zxing-js/browser
