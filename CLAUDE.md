# Draw — Front-end da Plataforma de Gestão Integrada

Front-end da plataforma descrita em `docs/spec-plataforma-draw.md` (spec v0.3). Nesta fase o
front é **completo e funcional com dados locais** (localStorage + seed). O back-end real
(ADR-001) entra depois trocando **só** a pasta `src/data/services`.

> Versão provisória das leis — o time vai substituir por uma versão revisada.

## Stack

- **Next.js 15 (App Router) + React 19 + TypeScript strict**
- **Tailwind CSS 4** com tokens em `src/app/globals.css` (espelho JS em `src/design/tokens.ts`)
- Radix UI (primitivas acessíveis), cmdk, dnd-kit, Recharts, sonner, next-themes
- TanStack Query sobre a "API" local (`src/data/services`)
- Ícones: lucide, **somente** via registro `src/design/icons.ts`
- Fontes: **Roboto** (corpo) e **Manrope** (títulos, rótulos, tags, números de KPI → `font-display`), via `@fontsource-variable/*`, sem CDN
- Estrutura/fluxos: **Plane** (superfícies em camadas, bordas finas, alta densidade, peek lateral)
- Identidade: **Draw the Law** — marinho `#071445` (neutros com matiz marinho), violeta `#784BFD` (ação),
  orquídea `#B549D5` e magenta `#CC3366` (acentos), gradiente-assinatura orquídea→violeta só decorativo

## Comandos

```bash
npm run dev          # http://localhost:3000
npm run build        # check:rules + typecheck + build
npm run check:rules  # guarda das leis (falha o build se violar)
```

Login de demonstração: qualquer usuário da seed com senha `draw123` (atalhos na tela de login).
"Trocar perfil (demonstração)" no menu do usuário alterna entre perfis para validar permissões.
Restaurar dados: Configurações → Preferências → "Restaurar dados de demonstração".

## Estrutura

```
src/
  app/(auth)/…            login, recuperar senha, convite
  app/(app)/…             telas autenticadas (uma pasta por rota da seção 10.3)
  app/nf/[token]          formulário público de NF do freelancer
  components/ui/          KIT — primitivas visuais (Button, Field, Dialog, DataTable…)
  components/domain/      componentes de NEGÓCIO compartilhados (ProjectCard, Kanban, TaskPeek…)
  components/features/<módulo>/  composições de um módulo (ainda componentes, nunca inline na página)
  components/layout/      chassi: rail, sidebar, barra inferior, paleta de comandos, sessão
  components/pwa/         service worker, instalação, atualização, offline
  data/types.ts           modelo de domínio (seção 6 da spec)
  data/reference.ts       etapas/status/prioridades fixos (P4)
  data/seed.ts            seed determinística
  data/services/          "API" local com regras de negócio RN-01…RN-12 (trocável pelo back-end)
  data/hooks.ts           useApiQuery / useApiMutation + hooks compartilhados
  lib/permissions.ts      matriz de permissões única (seção 9)
  lib/format.ts           dinheiro, datas (America/Sao_Paulo), CNPJ, telefone
```

---

## Leis do Projeto

Invioláveis. `npm run check:rules` verifica parte delas automaticamente.

### Lei 1 — Componentização sempre (Component-First)

- Nada é desenvolvido "só numa tela". Todo elemento visível vem de `components/ui`
  (primitiva), `components/domain` (negócio compartilhado) ou `components/features/<módulo>`.
- **Proibido em `src/app/**`:** `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`,
  `<tr>`, `<td>`, `<th>`, `<h1>`–`<h6>`. Use `Button`, `IconButton`, `TextField`, `SelectField`,
  `DataTable`, `PageHeader`, `Section`…
- Página = **composição**: busca dados com hooks e monta componentes. Lógica visual
  repetível vira componente antes de ser usada.
- Precisa de algo que não existe? **Crie primeiro** em `ui/` (se genérico) ou `domain/`
  (se é do negócio e usado por mais de um módulo) e depois use.
- **Ícone é componente:** `<Icon name="…" />`. Lucide só é importado em
  `src/design/icons.ts`. Nome pelo **significado** (`receivable`, `approval`), nunca pelo desenho.

### Lei 2 — Fonte única de verdade

- Mudou um componente do kit → muda em todas as telas. É o objetivo.
- Extensão de comportamento = **prop nova com default que preserva o atual**. Nunca
  `style={{}}` em tela, nunca clonar um componente dentro da página.
- Regras de negócio moram em `src/data/services` (back-end simulado), nunca na tela.
- Rótulos de etapas/status vêm de `src/data/reference.ts`; nunca string solta.

### Lei 3 — Tokens acima de tudo

- Cores, superfícies, raios, sombras, tamanhos: **só** pelas classes geradas dos tokens
  (`bg-surface`, `bg-layer`, `text-fg-muted`, `border-line`, `text-accent`, `rounded-lg`,
  `shadow-overlay`, `h-header`, `w-sidebar`…). Proibido hex/rgb soltos fora de `globals.css`
  e `design/tokens.ts`.
- Escala tipográfica densa estilo Plane: `text-2xs` 11 · `text-xs` 12 · `text-sm` 13 (padrão)
  · `text-base` 14 · `text-md` 16 · `text-lg` 20 · `text-xl` 24.
- Para JS (Recharts/SVG), use `t.*` de `src/design/tokens.ts` (sempre `var(--…)`).
- **Cor de ação tem dois papéis:** `bg-accent-solid` (+ `hover:bg-accent-solid-hover`) para FUNDOS com texto
  branco; `text-accent` / `border-accent` / `bg-accent-subtle` para texto, borda e tinta. Nunca `bg-accent`
  como fundo de botão (o contraste do texto quebra no tema escuro).
- **Marca:** `BrandMark`/`BrandLogo` do kit; gradiente via `bg-brand-gradient` **somente** em formas decorativas
  (círculos, logo) — nunca atrás de texto pequeno (branco sobre orquídea reprova AA). Botões são pílula
  sólida, sem brilho. Rail lateral pelos tokens `bg-rail`/`text-rail-fg*` (claro no tema claro, violeta
  profundo no escuro).
- **Temas partem do violeta da marca:** claro = superfícies brancas com neutros levemente lavanda (limpo,
  sem peso); escuro = violeta profundo/berinjela (nunca preto neutro), texto lavanda, destaque violeta.
  Profissional e sóbrio: saturação só no destaque, nunca em grandes áreas.
- **Datas:** sempre `DateField`/`DateInput`/`DatePicker` do kit (dd/mm/aaaa no desktop, nativo no celular);
  nunca `<input type="date">`.
- **Gráficos:** sempre de `components/domain/charts` (carregam sob demanda); nunca importar `charts-impl` ou recharts.
- Todo componente funciona nos **dois temas** (claro/escuro). Nunca cor dependente de tema fixa.

### Lei 4 — Commits obrigatórios, push sob demanda

- Commit logo após cada unidade lógica concluída, Conventional Commits (`feat:`, `fix:`…),
  citando IDs da spec quando aplicável (ex.: `feat(projetos): kanban por etapa (RF-M4-02)`).
- **Push só quando o usuário pedir.**

### Lei 5 — Dados só por hooks (pronto para o back-end)

- Telas usam **apenas** `useApiQuery`/`useApiMutation` e hooks de `src/data/hooks.ts`.
- Proibido em telas/componentes: `localStorage`, `@/data/db`, montar regra de negócio.
- Cada função de `src/data/services` espelha um endpoint do contrato (`/api/v1/...`).
  Trocar pelo back-end = reimplementar a função mantendo assinatura.
- Erros da API vêm como `ApiError` (status + mensagem orientada à solução + `fieldErrors`).

### Lei 6 — PWA desde o primeiro dia

- Manifest (`src/app/manifest.ts`), ícones (`public/icons`), service worker (`public/sw.js`)
  e `PwaProvider` fazem parte do chassi. Nenhuma feature pode quebrar a instalação.
- API/dados **nunca** em cache do SW. Logout limpa caches do usuário.
- Nova versão → banner "Nova versão disponível — Atualizar" (não prender em versão antiga).
- iOS: ajuda "Instalar no iPhone"; Android/desktop: `beforeinstallprompt`.

### Lei 7 — Responsivo de verdade (três faixas)

| Faixa | Layout |
|---|---|
| ≥ 1280 (`xl`) | Rail de seções + painel da seção (recolhível com `[`) + conteúdo. Nova seção/item → só em `nav-config.ts` (`SECTIONS`) |
| 768–1279 (`md`–`lg`) | Rail + painel em gaveta; kanban com rolagem horizontal; prontuário em uma coluna |
| < 768 | Barra inferior; **lista no lugar do kanban** por padrão; diálogos em tela cheia; ação principal em `Fab` |

- Alvos de toque ≥ 44 px no celular: controle visualmente pequeno (pílula, ícone, checkbox, switch) usa a
  utilidade `touch-target` (área invisível de 44 px em telas de toque) — já aplicada nos componentes do kit.
- Cartões de KPI (`Stat`) reduzem o valor por container query; cabeçalhos de `Section` quebram as ações só
  quando falta espaço; `Callout` leva a ação para linha própria no celular; `DataTable` no celular mostra o
  rótulo das colunas numéricas (`mobileLabel`).
- Nada depende de hover. Tabelas viram cartões (`DataTable` já faz). Safe areas respeitadas
  (`pt-safe`/`pb-safe`). Conteúdo rolável deixa espaço para a barra inferior (`PageBody` já faz).
- Testar em 360 px, 768 px, 1280 px e 1440 px.

### Lei 8 — Permissões centralizadas

- Matriz única em `src/lib/permissions.ts` (seção 9). Telas usam `usePermissions()` para
  **esconder** ações; o serviço é quem **garante** (e removerá campos de valor — RF-M1-05).
- Valores monetários na tela sempre via `<Money cents>` (mostra cadeado sem permissão).

### Lei 9 — Todos os estados

Toda tela/lista tem: carregando (`Skeleton` que imita o layout — presets de `ui/skeletons.tsx`), vazio (`EmptyState` com
próximo passo), erro (`ErrorState` com "Tentar novamente"), sucesso (toast). Ações destrutivas
com `ConfirmDialog`. Botões em requisição usam `loading` (mantém rótulo). Atualização otimista
no kanban.

### Movimento (complementa a Lei 9)

Micro-interações aumentam a qualidade percebida — **com sobriedade** (brandbook: profissional, sem ornamento nem
infantilização). Na dúvida, menos.

- **Durações:** 120–320 ms (`--motion-fast` 120 · `--motion-base` 200 · `--motion-slow` 320). Exceções: brilho do
  skeleton (loop) e contagem de números (~600 ms).
- **Easing:** `--ease-out` (padrão) e `--ease-spring` (mola contida: pop de status, assentar cartão). Sem quique.
- **Só GPU:** anime `transform`/`opacity`/`filter`. Nunca `width`/`height`/`top`/margens, nunca `transition: all`.
- **`prefers-reduced-motion`:** CSS desliga as animações decorativas; JS usa `useReducedMotion()` e pula o que dirige.
- **Onde vive:** keyframes/classes em `src/app/motion.css` (importado em `(app)/layout.tsx`, `nf/[token]/layout.tsx`
  e no convite); hooks/peças em `src/components/ui/motion.tsx`. Telas **nunca** usam classes `motion-*` direto: usam o kit.
- **Quando animar:** resposta a uma ação do usuário (mudou, concluiu, enviou, soltou) ou chegada de conteúdo. Nunca em
  loop chamando atenção, nunca a cada *refetch*.

| Precisa de… | Use |
|---|---|
| "Pop" quando um valor muda | `pulseKey={valor}` em `Pill`/`Badge` (já em `TaskStatusPill`, `PriorityPill`, selos de status, etapa) ou `useChangePulse(valor)` |
| Confirmação após mutação | `const ok = useSuccessFlash()` → `onSuccess: () => ok.flash(fecharOuNavegar)` + `<Button success={ok.success} successLabel="Enviado">` (`ConfirmDialog` aceita `success`) |
| Concluir tarefa | `TaskCheck` + `DoneTitle` (domain) com estado otimista no pai |
| Entrada de lista | `const enter = useEntrance()` → `{...enter(id)}` no item (DataTable, TaskList, Kanban já fazem) |
| Números / contador | `CountUp` (Stat numérico já usa), `CountBadge` (pulsa ao aumentar) |
| Bloco que surge (passo de assistente) | `<Reveal key={passo}>` |
| Carregando | Presets de `ui/skeletons.tsx`: `ListPageSkeleton`, `DetailPageSkeleton` (`DetailBodySkeleton`), `DashboardSkeleton`, `KanbanSkeleton`/`BoardPageSkeleton`, `FormSkeleton`/`FormPageSkeleton`, `TableRowsSkeleton`, `StatGridSkeleton`, `CardGridSkeleton`, `AppShellSkeleton`. Nunca spinner nem tela em branco; `Suspense` sempre com `fallback` de preset |

### Lei 10 — Texto e acessibilidade

- pt-BR, voz ativa, segunda pessoa; rótulos específicos ("Aprovar proposta", não "OK");
  ações com consequência terminam em reticências ("Concluir projeto…").
- Erros dizem como resolver ("CNPJ deve ter 14 dígitos").
- Terminologia: **Projeto** (não caso), **Cliente**, **Freelancer**, **Proposta**, **Etapa**.
- Foco visível, contraste AA, `aria-label` em botões só-ícone (o `IconButton` exige `label`),
  `aria-live` em validação. Filtros, abas, visão e painéis abertos persistem na URL
  (`useUrlState`).

---

### Lei 11 — A spec é a wiki viva do projeto

- `docs/spec-plataforma-draw.md` é a referência que vai para o time de back-end/banco. Toda mudança de modelo
  (`src/data/types.ts`), regra (`src/data/services`), etapa/referência (`src/data/reference.ts`), rota ou decisão
  entra na spec **no mesmo commit** — seção certa + nota na "Mudança da 0.x" do topo.
- Nova regra de negócio ganha ID `RN-xx` na seção 8 e teste em `src/data/services/*.test.ts`.
- Mapeamentos da operação real (planilha master, quadros, pastas) ficam na seção 20; estado da implementação e
  correspondência função → endpoint na seção 21.

## Padrões canônicos

**Listagem** (ex.: `/clientes`)
```
PageHeader (crumbs, count, ações: ViewSwitcher · Button primário)
Toolbar (SearchInput · FilterChip(s) · ClearFiltersButton)
PageBody padded={false} → DataTable (já trata loading/vazio/erro e vira cartões no celular)
Fab (ação primária no celular) · Dialogs/ConfirmDialog fora do corpo
```

**Quadro** (ex.: `/projetos`, `/comercial`): `PageHeader` + `Toolbar` + `Kanban` (desktop) /
lista agrupada (celular por padrão) + `Fab`.

**Detalhe/prontuário** (ex.: `/projetos/[code]`): `PageHeader` + cabeçalho do registro +
`Tabs` (aba na URL `?aba=`) + conteúdo à esquerda e coluna de propriedades à direita
(`PropertyRow`) — no tablet/celular a coluna vai para cima.

**Formulário**: `Dialog` (curto) ou página com `Section`s (longo). Campos `TextField`,
`SelectField`, `MoneyField`, `DateField`, `TextareaField`. Validação inline no submit, foco no
primeiro erro, mensagens que guiam. Nunca pré-desabilitar o submit.

**Painel/indicadores**: grade de `Stat` + `Section` com gráficos (`components/domain/charts`).

## Checklist antes de cada commit

- [ ] Nenhuma primitiva crua em `src/app/**` e `npm run check:rules` passa
- [ ] Componente novo no lugar certo (`ui` / `domain` / `features`) e reutilizado
- [ ] Só tokens (sem hex/px soltos), funciona em claro e escuro
- [ ] Loading, vazio, erro e sucesso tratados
- [ ] Testado em celular (360 px) e desktop; nada depende de hover
- [ ] Ações escondidas conforme `usePermissions()`; valores via `<Money>`
- [ ] Dados via hooks; regra de negócio no service
- [ ] `npx tsc --noEmit` limpo; commit Conventional citando IDs da spec
