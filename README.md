# Cadê meus pontos?

Aplicação web para registrar compras bonificadas, acompanhar a previsão de crédito e preparar uma mensagem de cobrança.

## Funcionalidades

- Tela inicial com aviso claro de que o app não acessa programas de fidelidade nem consulta saldos.
- Cadastro guiado em etapas para parceiro, programa, valor, fator, data, prazo e informações da campanha.
- Cálculo de pontos esperados e previsão de recebimento em dias corridos ou úteis, com ajuste manual da data.
- Extrato com busca, filtros por situação e identificação automática de atrasos.
- Detalhe da compra, opção de marcar pontos recebidos e texto de cobrança editável para copiar.
- Dados e regulamentos salvos localmente no navegador. Anexos limitados a PDF/PNG de até 1 MB.
- Logo vetorial original em SVG para o símbolo do aplicativo.

## Executar

Abra `index.html` em um servidor estático. A aplicação não exige build nem dependências. Por exemplo:

```bash
python3 -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

## Limites desta versão

Os dados existem apenas no armazenamento local do navegador e não são sincronizados. Autenticação por e-mail, envio de chaves temporárias e armazenamento compartilhado seguro precisam de um serviço de backend e de e-mail. Nenhum serviço pago foi contratado ou integrado. Dias úteis são calculados de segunda a sexta, sem considerar feriados. O armazenamento local não substitui um backup.
