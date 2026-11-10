# Cushn Desktop

A local-first budgeting app for macOS, Windows and Linux. Your budgets, expenses and templates live in a SQLite database on your own machine: no account, no server, no sync service.

Built with Electron, React, TanStack Router/Query, Tailwind CSS and SQLite (`better-sqlite3` + Drizzle).

## Development

Requires Node 24 and pnpm 10.

```sh
pnpm install     # also rebuilds native deps for Electron
pnpm dev         # run the app with hot reload
pnpm typecheck   # type-check main/preload and renderer
pnpm test        # run unit tests (Vitest)
pnpm build       # production build into out/
pnpm package     # build installers into release/ (electron-builder)
```

## License

The code is licensed under the [Apache License 2.0](LICENSE).

The "Cushn" name and logo are **not** covered by that license. See [TRADEMARKS.md](TRADEMARKS.md).
