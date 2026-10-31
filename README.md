# epubkit

Create, read, merge, edit and validate EPUB files. Bun workspace with two packages:

- `packages/core` — `@epubkit/core`, the EPUB library.
- `packages/cli` — the `epubkit` command.

## Install

```bash
bun install
bun run packages/cli/src/cli.ts --help
```

## Commands

```bash
epubkit info <file>                      # metadata, spine, cover, TOC
epubkit extract <file> -o <dir>          # unzip an EPUB
epubkit pack <dir> -o <file>             # zip a directory back into an EPUB
epubkit validate <file>                  # structural checks
epubkit create <dir|file> -o <file>      # build from a manifest, HTML or Markdown
epubkit merge a.epub b.epub -o out.epub  # merge several books
epubkit page <file> --at 3 --with x.html # replace or add a page
epubkit image <file> --at cover --with c.jpg
epubkit meta <file> --title "নতুন নাম"   # edit OPF metadata
epubkit toc <file> --set "text/1.xhtml=নাম"
epubkit stats <file>                     # words, reading time, size
```

Editing commands take `-o/--out`, or `--in-place` with optional `--backup`. `--dry-run` and `--validate` are available where they make sense.

### Create

`create` accepts:

- a directory containing `book.json` or `manifest.json`,
- a single `.html` or `.md` file,
- a directory of numbered `.html`/`.md` files.

```json
{
  "title": "বইয়ের নাম",
  "authors": ["লেখক"],
  "language": "bn",
  "style": "classic",
  "cover": "cover.jpg",
  "parts": [
    {
      "title": "প্রথম অংশ",
      "lessons": [
        { "title": "পাঠ এক", "file": "01.html", "topics": [{ "title": "বিষয়", "file": "01-1.html" }] }
      ]
    }
  ]
}
```

### Merge

`merge` nests each book's TOC under its title. `--flat` concatenates instead, `--unify-css <file>` applies one stylesheet everywhere, and `--dry-run` prints the merged TOC.

## Library

```ts
import {
  buildEpub,
  readEpub,
  validateEpub,
  generateCover,
  themeCss,
} from "@epubkit/core";

const { data } = buildEpub({
  title: "বই",
  authors: ["লেখক"],
  language: "bn",
  style: "classic",
  parts: [{ title: "অংশ এক", lessons: [{ title: "পাঠ", html: "<p>…</p>" }] }],
});

const report = validateEpub(data);
```

`buildEpub` handles cover, fonts, images, nav, NCX, OPF, CSS and zip layout (mimetype stored first). `BookInput` supports `font` or several `fonts` (regular/bold subsets) and `images` referenced from chapter HTML as `../images/<name>`.

## Design

- EPUB 3 with an NCX fallback.
- Themes: `classic` (white/cream, serif, centered headings), `minimal`, `none`.
- Cover: site image accepted only when ≥ 800 px wide and near 2:3, otherwise a 1600×2400 typographic SVG/JPEG.
- HTML is sanitised: unknown tags unwrapped, scripts/forms/ads dropped, inline styles reduced to `text-align`.
- Deterministic output: stable UUIDs, fixed zip timestamps.

## Development

```bash
bun test
bunx tsc --noEmit
bun build packages/cli/src/cli.ts --compile --outfile dist/epubkit
```
