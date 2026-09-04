# PerfectMarkD

Turns markdown into perfectly laid-out PDFs — the platform-independent successor to the [Advanced PDF Export](https://github.com/ShrekBytes/advanced-pdf-export) Obsidian plugin. Drop-in editor, no signup: what you see is exactly the PDF you get.

Status: pre-launch. The roadmap lives in [PLAN.md](PLAN.md), decisions in [docs/adr/](docs/adr/), tickets in `.scratch/`.

## Layout

pnpm monorepo:

| Package                          | Planned scope                                                           |
| -------------------------------- | ----------------------------------------------------------------------- |
| [`packages/core`](packages/core) | Framework-free rendering engine: markdown → paginated, print-ready HTML |
| [`apps/web`](apps/web)           | React + Vite SPA: editor, Paper Canvas preview, Client Export           |
| [`apps/server`](apps/server)     | Node + Hono API: auth, billing, Server Export worker                    |

## Development

Requires Node ≥ 22 and pnpm (via `corepack enable`).

```sh
pnpm install
pnpm build      # build all packages
pnpm test       # run every suite (vitest, watch: pnpm test:watch)
pnpm lint       # eslint
pnpm typecheck  # tsc per package
pnpm format     # prettier

pnpm --filter @perfectmarkd/web dev     # web app dev server
pnpm --filter @perfectmarkd/server dev  # API dev server
```

Pull requests run lint, typecheck, build, and tests via [.github/workflows/ci.yml](.github/workflows/ci.yml).

## License

[AGPL-3.0](LICENSE) — see [docs/adr/0001-agpl3-open-codebase.md](docs/adr/0001-agpl3-open-codebase.md) for why.
