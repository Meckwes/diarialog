# DiáriaLog

Controle de escala, demandas e repasse para diaristas de centro de distribuição (Amazon & Shopee).
App de página única, **client-side**: roda no navegador, guarda tudo no `localStorage`, sem servidor,
sem conta e sem custo de hospedagem.

![DiáriaLog](public/images/diarialog-logo-512.png)

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # gera dist/
npm run preview  # serve o dist em http://localhost:4180
```

## O que ele faz

**Escala** — registre dia, loja (Amazon/Shopee), entrada, saída e valor a receber. O formulário
mostra em tempo real como o evento fica no calendário (`Trabalho shopee · R$ 145,00 · 19:00 às 20:00`)
e depois dá pra mandar direto pro **Google Agenda** ou exportar `.ics`.

**Semanas** — soma da semana ISO automática, horas, dias trabalhados, e o card de cada semana com a
janela de repasse, o status e o botão de registrar o depósito.

**Conferência** — previsto × depositado por semana, com a diferença calculada e os totais no topo
("faltou receber R$ 20,00"). Exporta CSV, importa backup JSON, carrega exemplo.

## Regras de domínio

- **Semana de trabalho** = semana ISO (segunda → domingo).
- **Semana de repasse** = semana de trabalho + 1.
- **Janela de repasse** = **quarta-feira 00:00 → sexta 22:00** (semana seguinte). A abertura é fixa.
- **Limite de demandas** = 14 por mês. O card no topo mostra `X/14`, o progresso e uma frase
  de incentivo a cada turno registrado.
- **Status automático**: `Previsto` → `Em trânsito` → `Pago` / `Atrasado`.
- **Turno noturno**: saída < entrada ⇒ o turno vira a meia-noite (22:00 → 06:00 = 8h).
- **Conferência**: valor depositado × previsto, diferença por semana.

As regras são validadas por `npm run test:rules` (27 asserts de data, janela e soma).

## Detalhes de implementação

- **Calendário no campo de data**: o `onClick` chama `input.showPicker()` (Chrome 99+), então clicar
  em qualquer parte do campo abre o calendário nativo — sem precisar mirar o ícone.
- **Fonte do campo de data**: o Chrome usa uma fonte própria em `input[type=date]`; o `index.css`
  força `font-family: inherit` nos pseudo-elementos `::-webkit-datetime-edit*` pra ficar igual ao resto.
- **Datas locais**: nunca use `toISOString()` pra formatar data (em BRT, 22:00 vira o dia seguinte em
  UTC). O helper `ymd(date)` em `src/diarialog/dates.ts` resolve.
- **Semana ISO a partir da chave `YYYY-Www`**: âncora = (quinta-feira da semana 1 do ano ISO − 3 dias)
  + (w−1)×7 dias. Nunca derivar de `weekInfoOf(ano-01-04)` (devolve sempre W01).

## Onde mexer

| Quero mudar…                       | Arquivo                       |
| ---------------------------------- | ----------------------------- |
| Cores / fontes / animações         | `tailwind.config.js`          |
| Estilos globais (card, botão, campo) | `src/index.css`              |
| Logo (marca + wordmark)            | `src/diarialog/DiaryLogo.tsx`  |
| Regras de data e repasse           | `src/diarialog/dates.ts`       |
| Soma semanal e conferência         | `src/diarialog/compute.ts`     |
| Texto das telas (KPIs, botões)     | `src/diarialog/DiaryLogPage.tsx` |

## Deploy

`vercel.json` / `netlify.toml` não são necessários — é SPA estática. Serve o `dist/` em qualquer
host estático (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

---

## No ar

- **https://diarialog.vercel.app** (Vercel, escopo da conta Fity)
- Deploy automatico a cada push na branch main (GitHub Meckwes/diarialog)
