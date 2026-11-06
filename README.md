# Cadê meus pontos?

Aplicação web para registrar compras bonificadas, acompanhar a previsão de crédito e saber quando abrir uma reclamação para o parceiro.

## Funcionalidades

- Primeiro acesso por e-mail e chave temporária de uso único, sem senha ou cadastro manual.
- Espaço pessoal criado no primeiro acesso e recuperado nos seguintes.
- Compras, regulamentos e situação de crédito salvos na nuvem, vinculados ao e-mail autenticado.
- Cadastro guiado para parceiro, programa, valor, fator, data, prazo e informações da campanha.
- Cálculo de pontos e previsão de recebimento em dias corridos ou úteis, com ajuste manual.
- Extrato com busca, filtros por situação e identificação automática de atrasos.
- Anexos de regulamentos limitados a PDF/PNG de até 1 MB.
- O app não acessa programas de fidelidade nem consulta saldos.

## Cloudflare

O site é servido por um Cloudflare Worker. Os dados de acesso e compras ficam no D1; as chaves de uso único são enviadas pelo serviço de e-mail do Cloudflare. Configure os bindings D1 e `send_email` definidos em `wrangler.jsonc` antes de publicar.

Para regenerar o módulo com os arquivos da interface e publicar com Wrangler:

```bash
node build-assets.mjs
npx wrangler deploy
```

## Limites

A chave expira em 10 minutos e pode ser usada uma vez. O Worker limita pedidos de chave por endereço de e-mail. Anexos têm limite de 1 MB. Dias úteis são calculados de segunda a sexta, sem considerar feriados.
