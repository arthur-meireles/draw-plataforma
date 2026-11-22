# Deploy — Cloudflare Workers

O front roda em **Cloudflare Workers** via [OpenNext](https://opennext.js.org/cloudflare)
(`@opennextjs/cloudflare`). Configuração: `wrangler.jsonc` (Worker `draw-plataforma`) e `open-next.config.ts`.

## Variáveis de build

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Senha da conta `admin@drawthelaw.com.br` na seed. Sem ela, vale `draw123`. |
| `NEXT_PUBLIC_DEMO_LOGIN` | `1` mostra os atalhos de demonstração no login. Em produção, o padrão é ocultar. |

Localmente, coloque-as em `.env.production.local`, que está fora do Git.

## Opção A — Integração Git (Workers Builds) — em uso

Repositório: `github.com/arthur-meireles/draw-plataforma`, branch `main`. Todo push na `main` gera build e deploy.

1. **Workers & Pages → Create application → Import a repository.**
   - Conecte o GitHub `arthur-meireles`. Na primeira vez, a Cloudflare pede para instalar o app "Cloudflare Workers and Pages"; dê acesso ao repositório `draw-plataforma`.
   - Escolha o repositório.
2. **Configure o projeto:**

   | Campo | Valor |
   |---|---|
   | Project name | `draw-plataforma` (tem que ser igual a `name` no `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npx opennextjs-cloudflare build` |
   | Deploy command | `npx opennextjs-cloudflare deploy` |
   | Non-production branch deploy command (opcional) | `npx opennextjs-cloudflare upload` (gera URL de preview por branch, sem afetar produção) |
   | Root directory | vazio (raiz) |

3. **Variáveis de BUILD** — no mesmo formulário, em *Advanced settings → Build variables*, ou depois em *Settings → Build → Variables and secrets*:

   | Nome | Valor | Tipo |
   |---|---|---|
   | `NEXT_PUBLIC_ADMIN_PASSWORD` | senha do admin | Secret |
   | `NODE_VERSION` | `22` | Text |
   | `NEXT_PUBLIC_DEMO_LOGIN` | `1` só se quiser os atalhos de demonstração no login | Text |

   ⚠️ Precisam ser **variáveis de build**. Não use *Settings → Variables and Secrets* do Worker (runtime): `NEXT_PUBLIC_*` é embutido no JavaScript durante o build. Variável colocada só no runtime não muda nada.

4. **Save and Deploy.**
   - O primeiro build leva de 3 a 5 minutos.
   - A URL fica em `https://draw-plataforma.<subdominio>.workers.dev`.
   - Domínio próprio (ex.: `app.drawthelaw.com.br`): *Settings → Domains & Routes → Add → Custom domain*.
5. **Mudou uma variável?** Faça *Deployments → Retry build* (ou um novo push); o valor só entra no próximo build.

**Fluxo de trabalho:** desenvolvimento nesta sessão → commit → `git push origin main` → Cloudflare publica sozinha. O histórico fica em *Deployments*, onde dá para voltar a uma versão anterior com *Rollback*.

**Instalação:** o `.npmrc` (`legacy-peer-deps=true`) é necessário porque o build roda `npm ci` limpo. Validado com uma instalação limpa + `opennextjs-cloudflare build` simulando o ambiente da Cloudflare.

## Opção B — Pelo terminal

```bash
npx wrangler login
```
```bash
npm run deploy
```

## Testar localmente no runtime da Cloudflare

```bash
npm run preview
```

A porta padrão é 8787. Já foi validado no `workerd`: login de admin, rotas dinâmicas, service worker e manifest.

## Observações

- `keep_names: false` no `wrangler.jsonc` evita o erro `__name is not defined` no script inline de tema.
- Os dados ficam no navegador (localStorage). Cada pessoa vê a própria cópia da seed. O back-end
  real (ADR-001) substitui `src/data/services`.
