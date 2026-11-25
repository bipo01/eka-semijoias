# Plano — Configurações em abas e chave Pix formatada

> 24/11/2026. Pedido: "configurações por abas, tem muita coisa" e "CPF, CNPJ e outros tipos formatados automaticamente; hoje o CPF fica sem pontuação e aceita mais ou menos números".

## 1. Abas
A página tinha 7 blocos empilhados (lista do que falta, informações da loja, o que a loja oferece, Pix, avisos no celular, estoque, PIN). Passa a ter abas, no mesmo padrão de chips das outras telas do painel (Revendedoras), com o endereço `?aba=` para links diretos:

| Aba | `?aba=` | Conteúdo |
|---|---|---|
| Loja | (padrão) | O que falta preencher + Informações da loja |
| O que oferecemos | `oferta` | O que a loja oferece |
| Pix | `pix` | Pix para receber |
| Avisos | `avisos` | Avisos no celular |
| Estoque | `estoque` | Últimas unidades |
| PIN | `pin` | Alterar PIN |

- A lista do que falta continua no topo da aba Loja, e cada item aponta para a aba onde se preenche (ou para Painel → Site).
- Links que levam às Configurações vão direto para a aba certa: "cadastre o Pix" na cobrança → `?aba=pix`; o aviso de teste no celular → `?aba=avisos`.
- Um `?aba=` desconhecido abre a aba Loja. Cada aba é um formulário próprio que salva sozinho; trocar de aba descarta só o que não foi salvo naquela aba (como sair da página hoje).

## 2. Chave Pix formatada
Um campo que formata enquanto digita, por tipo, e nunca aceita caracteres a mais:

| Tipo | Máscara | Limite | Teclado |
|---|---|---|---|
| CPF | `000.000.000-00` | 11 números | numérico |
| CNPJ | `00.000.000/0000-00` (letras A–Z nas 12 primeiras posições, CNPJ alfanumérico de 2026) | 14 | texto em maiúsculas |
| Celular | `(00) 00000-0000` (aceita colar com +55) | 11 números | telefone |
| E-mail | minúsculo, sem espaços | 77 | e-mail |
| Chave aleatória | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | 32 letras/números (0–9, a–f) | texto |

- Trocar o tipo reaproveita o que dá (números) e limpa o resto.
- Colar uma chave de outro tipo com o campo vazio troca o tipo sozinho (e-mail, chave aleatória, CNPJ com 14, CPF com 11, celular com +55).
- O erro aparece quando o campo está completo e inválido (dígito verificador), ou ao salvar se faltar número; antes disso, a dica mostra o formato e quantos números faltam.
- O servidor continua validando (`normalizePixKey` + schema); a mesma regra vale no navegador e no Worker.

## 3. Testes
Unidade: máscara e limite de cada tipo, colar, troca de tipo, CNPJ alfanumérico (exemplo da Receita 12.ABC.345/01DE-35), CPF/CNPJ inválidos. Componente: abas (`?aba=`), lista do que falta levando à aba. E2E: fluxo existente do Pix ajustado para a aba. Navegador: celular e computador.
