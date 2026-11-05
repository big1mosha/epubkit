# Contributing

## Requirements

- [Bun](https://bun.sh) (latest).
- git.

## Setup

```bash
git clone https://github.com/big1mosha/epubkit.git
cd epubkit
bun install
bun run packages/cli/src/index.ts --help
```

## Layout

- `packages/core` — `@epubkit/core`, the EPUB library. No CLI or eblib code here.
- `packages/cli` — `epubkit-cli`, the `epubkit` command.

`core` is a plain library: it must stay usable without the CLI, must not import
from `packages/cli`, and must not depend on a scraping tool.

## Scripts

```bash
bun test
bun run typecheck
bun run build    # compiled binary in dist/epubkit
```

## Adding a command

1. Add the implementation in `packages/core` when it is reusable, or
   `packages/cli/src/commands` when it is CLI-only.
2. Register it in `packages/cli/src/index.ts`.
3. Add a test under the matching `test/` folder.
4. Export new public API from `packages/core/src/index.ts`.

Editing commands should support `-o/--out` or `--in-place`, and `--dry-run`
where it makes sense.

## Code

- TypeScript, strict mode, ESM, `.ts` extensions in relative imports.
- Split by feature under `src/`: `archive`, `book`, `html`, `cover`, `style`,
  `validate`, `util`.
- Bun APIs are fine in tests; `core` runtime code should stay portable.
- Prefer the standard library over new dependencies.
- Tests use `bun:test` and live in `test/`.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
Keep the subject short and imperative.

By contributing you agree your changes are licensed under the [MIT License](LICENSE).
