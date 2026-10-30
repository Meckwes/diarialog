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

**Seu nome, uma vez só** — na primeira visita o app pergunta como te chamar. O nome fica guardado no
seu aparelho (junto com os turnos, no mesmo `localStorage` e no mesmo backup JSON) e aparece no topo
como "Olá, Fulano". Dá pra trocar clicando na própria saudação. O "Limpar tudo" apaga turnos e
conferências, mas **mantém o seu nome** — é a pessoa, não os dados.

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
- **Nome**: uma única pergunta na primeira visita; `normalizeName` / `firstName` / `greetingFor` em
  `src/diarialog/compute.ts`. A saudação usa só o primeiro nome.

As regras são validadas por `npm run test:rules` (39 asserts de data, janela, soma e contador de demandas).

## Guia em PDF

O app serve um guia rápido em formato ebook: **https://diarialog.vercel.app/guia-diarialog.pdf**
(13 páginas A4, sumário clicável, marcadores/livro de marcadores). O botão **Guia** no cabeçalho e o
link **Guia rápido · PDF** no rodapé abrem esse arquivo.

A fonte é `guide/guia.html` (uma `<section class="page">` por página, A4 em mm). Para regerar:

```bash
node scripts/build-guide.mjs   # renderiza, aplica marcadores e copia pra public/
```

| Script | O que faz |
| ------ | --------- |
| `scripts/build-guide.mjs` | pipeline completo (render → marcadores → `public/`) |
| `scripts/render-guide-cli.mjs` | HTML → PDF via Chrome `--print-to-pdf` |
| `scripts/add-guide-links.mjs` | mede a geometria do sumário e monta o outline do PDF |
| `scripts/optimize-guide-images.mjs` | reencode das capturas em JPEG (imagem grande = PDF enorme) |
| `scripts/check-guide-overflow.mjs` | mede se o conteúdo estourou a página |
| `scripts/verify-pdf.mjs` / `scripts/inspect-pdf.mjs` | confere páginas, A4, links e imagens |

Duas lições que custaram tempo e estão codificadas nos scripts:

- **Nada de transparência no CSS de impressão.** Gradiente com alfa vira raster no PDF (~400 KB por
  página). Os blobs da aurora foram trocados por degradês **opacos** que terminam no branco do papel:
  o PDF caiu de 11 MB para 1,5 MB sem mudar o visual.
- **`filter: blur()` trava o `Page.printToPDF` do CDP** neste documento. O caminho que funciona é a
  flag `--print-to-pdf` do Chrome (`scripts/render-guide-cli.mjs`), que usa o mesmo motor de impressão.

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
| Conteúdo do guia em PDF           | `guide/guia.html`               |

## Deploy

`vercel.json` / `netlify.toml` não são necessários — é SPA estática. Serve o `dist/` em qualquer
host estático (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

---

## No ar

- **https://diarialog.vercel.app** (Vercel, escopo da conta Fity)
- Deploy automatico a cada push na branch main (GitHub Meckwes/diarialog)
