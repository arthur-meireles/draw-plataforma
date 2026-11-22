# Deploy — Cloudflare Workers

O front roda em **Cloudflare Workers** via [OpenNext](https://opennext.js.org/cloudflare)
(`@opennextjs/cloudflare`). Configuração: `wrangler.jsonc` (Worker `draw-plataforma`) e `open-next.config.ts`.

## Variáveis de build

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Senha da conta `admin@drawthelaw.com.br` na seed. Sem ela, vale `draw123`. |
| `NEXT_PUBLIC_DEMO_LOGIN` | `1` mostra os atalhos de demonstração no login. Em produção, o padrão é ocultar. |

Localmente, coloque-as em `.env.production.local`, que está fora do Git.

## Opção A — Integração Git (recomendada)

1. Crie um repositório **privado** no GitHub e envie o código:
   ```bash
   git remote add origin git@github.com:<usuario>/draw-plataforma.git
   ```
   ```bash
   git push -u origin main
   ```
2. Na Cloudflare, vá em **Workers & Pages → Create → Import a repository**, escolha o repositório e preencha:
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
   - **Variables (build):** `NEXT_PUBLIC_ADMIN_PASSWORD=<senha>`
3. A partir daí, cada push na `main` publica sozinho.

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
