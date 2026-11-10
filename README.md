# Cadê meus pontos?

Aplicação web para registrar compras bonificadas, acompanhar a previsão de crédito e preparar mensagens para abrir reclamações.

## Funcionalidades

- Primeiro acesso por e-mail e chave temporária de uso único, sem senha ou cadastro manual.
- Espaço pessoal criado no primeiro acesso e recuperado nos seguintes.
- Compras, regulamentos e situação de crédito salvos na nuvem, vinculados ao e-mail autenticado.
- Cadastro guiado com nome da loja, programa, valor, fator, data e prazo corrido ou útil, com data prevista editável.
- Extrato compacto e expansível, com busca, alertas de atraso e seção recolhida para itens recebidos.
- Registro rápido de recebimentos integrais ou parciais, mantendo visível apenas o saldo pendente. Todos os campos, inclusive os pontos recebidos e anexos, podem ser editados depois.
- Edição de lançamentos e modelos de reclamação para ausência total ou crédito parcial.
- Anexos de regulamentos limitados a PDF/PNG de até 1 MB.
- Excluir lançamento (com confirmação; apaga também o anexo).
- Painel na tela inicial: resumo por programa (a caminho, recebidos, prazos vencidos) e "Lojas que mais atrasam", calculado só com as compras da própria pessoa. O atraso dos recebidos usa a data em que o recebimento foi registrado (`receivedAt`, guardado dentro da compra a partir desta versão).
- Aviso por e-mail (opcional, a pessoa ativa na tela inicial): um Cron diário (12h UTC = 9h em Brasília) envia um e-mail com as compras que passaram do prazo sem recebimento registrado, com link `/?compra=ID` que abre a compra. Cada compra é avisada uma vez por data prevista (`alertedFor`, dentro da compra). Preferência na tabela nova `alert_prefs`, criada sozinha pelo Worker.
- "Baixar extrato (planilha)": CSV com todas as compras, pronto para Excel/Google Planilhas.
- "Lembrar na agenda": arquivo .ics com lembrete às 9h na data prevista de crédito.
- O app não acessa programas de fidelidade nem consulta saldos.

## Cloudflare

O site é servido por um Cloudflare Worker. As tabelas originais (`users`, `login_codes`, `sessions`, `purchases`, `attachments`) não mudam; novidades ficam dentro do JSON da compra ou em tabela nova (`alert_prefs`). Os dados de acesso e compras ficam no D1; as chaves de uso único são enviadas pelo serviço de e-mail do Cloudflare. Os vínculos estão definidos em `wrangler.jsonc`.

Para regenerar o módulo com os arquivos da interface e publicar com Wrangler:

```bash
node build-assets.mjs
npx wrangler deploy
```

## Limites

A chave expira em 10 minutos e pode ser usada uma vez. O Worker limita pedidos de chave por endereço de e-mail. Anexos têm limite de 1 MB. Dias úteis são calculados de segunda a sexta, sem considerar feriados.
