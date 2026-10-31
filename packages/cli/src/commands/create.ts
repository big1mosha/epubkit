import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { marked } from "marked";
import {
  buildEpub,
  coverFromBytes,
  generateCover,
  sanitizeHtml,
  validateEpub,
  type BookInput,
  type ChapterInput,
  type FontInput,
  type PartInput,
  type ThemeName,
} from "@epubkit/core";
import { EXIT, exists, fail, isDirectory, readBinary, readText, writeBinary } from "../io.ts";
import type { Output } from "../io.ts";

interface ManifestChapter {
  title: string;
  file?: string;
  html?: string;
  topics?: ManifestChapter[];
}

interface ManifestPart {
  title?: string;
  label?: string;
  lessons: ManifestChapter[];
}

interface Manifest {
  title: string;
  authors?: string[];
  language?: string;
  publisher?: string;
  date?: string;
  description?: string;
  subjects?: string[];
  series?: string;
  seriesIndex?: number;
  source?: string;
  rights?: string;
  cover?: string;
  font?: string;
  fontFamily?: string;
  style?: ThemeName;
  splitSizeKb?: number;
  parts: ManifestPart[];
}

export async function createCommand(
  input: string,
  options: {
    out?: string;
    title?: string;
    author?: string | string[];
    language?: string;
    style?: string;
    cover?: string | boolean;
    validate?: boolean;
  },
  out: Output,
): Promise<void> {
  const { directory, manifest } = await resolveInput(input, options.title);

  if (!manifest.title) fail("Manifest is missing a title", EXIT.usage);
  if (!Array.isArray(manifest.parts)) fail("Manifest is missing parts", EXIT.usage);

  const authors =
    options.author && options.author.length > 0
      ? Array.isArray(options.author)
        ? options.author
        : [options.author]
      : manifest.authors ?? [];

  const renderChapter = async (chapter: ManifestChapter): Promise<ChapterInput> => {
    let html = chapter.html ?? "";
    if (chapter.file) {
      const path = isAbsolute(chapter.file) ? chapter.file : resolve(directory, chapter.file);
      const raw = await readText(path);
      html = /\.(md|markdown)$/i.test(chapter.file)
        ? sanitizeHtml(String(await marked.parse(raw)))
        : raw;
    }
    return {
      title: chapter.title,
      html,
      topics: chapter.topics ? await Promise.all(chapter.topics.map(renderChapter)) : undefined,
    };
  };

  const parts: PartInput[] = [];
  for (const part of manifest.parts) {
    parts.push({
      title: part.title,
      label: part.label,
      lessons: await Promise.all(part.lessons.map(renderChapter)),
    });
  }

  let cover: BookInput["cover"];
  if (options.cover !== false && options.cover !== "none") {
    if (typeof options.cover === "string") {
      cover = coverFromBytes(await readBinary(options.cover)) ?? undefined;
      if (!cover) fail(`Unsupported cover image: ${options.cover}`, EXIT.usage);
    } else if (manifest.cover) {
      const path = isAbsolute(manifest.cover) ? manifest.cover : resolve(directory, manifest.cover);
      cover = coverFromBytes(await readBinary(path)) ?? undefined;
      if (!cover) fail(`Unsupported cover image: ${path}`, EXIT.usage);
    } else {
      cover = await generateCover({
        title: options.title ?? manifest.title,
        authors,
        series: manifest.series,
        imprint: manifest.publisher,
      });
    }
  }

  let font: FontInput | undefined;
  if (manifest.font) {
    const path = isAbsolute(manifest.font) ? manifest.font : resolve(directory, manifest.font);
    font = {
      data: await readBinary(path),
      filename: path.split("/").pop() ?? "font.woff2",
      family: manifest.fontFamily ?? "Noto Serif Bengali",
    };
  }

  const book: BookInput = {
    title: options.title ?? manifest.title,
    authors,
    language: options.language ?? manifest.language ?? "bn",
    publisher: manifest.publisher,
    date: manifest.date,
    description: manifest.description,
    subjects: manifest.subjects,
    series: manifest.series,
    seriesIndex: manifest.seriesIndex,
    source: manifest.source,
    rights: manifest.rights,
    cover,
    font,
    style: (options.style as ThemeName | undefined) ?? manifest.style ?? "classic",
    splitSizeKb: manifest.splitSizeKb,
    parts,
  };

  const result = buildEpub(book);
  const target =
    options.out ??
    `${book.title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "book"}.epub`;
  await writeBinary(target, result.data);
  out.info(`Created ${target} (${parts.reduce((total, part) => total + part.lessons.length, 0)} chapters)`);

  if (options.validate) {
    const report = validateEpub(result.data);
    for (const issue of report.errors) out.error(`${issue.code}: ${issue.message}`);
    if (!report.ok) fail("Validation failed", EXIT.invalid);
  }
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/**
 * Accept a manifest (`book.json` or `manifest.json`), a single HTML/Markdown
 * file, or a directory of chapter files sorted by name.
 */
async function resolveInput(
  input: string,
  titleOverride?: string,
): Promise<{ directory: string; manifest: Manifest }> {
  if (await isDirectory(input)) {
    for (const name of ["book.json", "manifest.json"]) {
      const path = join(input, name);
      if (await exists(path)) return { directory: input, manifest: await readJson<Manifest>(path) };
    }
    return { directory: input, manifest: await manifestFromChapters(input, titleOverride) };
  }

  if (/\.json$/i.test(input)) {
    return { directory: dirname(input), manifest: await readJson<Manifest>(input) };
  }
  if (/\.(md|markdown|html?)$/i.test(input)) {
    return { directory: dirname(input), manifest: await manifestFromFile(input, titleOverride) };
  }
  return fail(`Unsupported input: ${input} (expected a directory, .json, .html or .md)`, EXIT.usage);
}

async function manifestFromFile(path: string, titleOverride?: string): Promise<Manifest> {
  const raw = await readText(path);
  const heading =
    /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ??
    /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(raw)?.[1]?.replace(/<[^>]*>/g, "").trim();
  const title = titleOverride ?? heading ?? titleFromFilename(path);
  return { title, parts: [{ lessons: [{ title, file: path }] }] };
}

async function manifestFromChapters(dir: string, titleOverride?: string): Promise<Manifest> {
  const files = (await readdir(dir))
    .filter((name) => /\.(md|markdown|html?)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) fail(`No book.json, manifest.json or chapter files in ${dir}`, EXIT.usage);

  return {
    title: titleOverride ?? basename(dir),
    parts: [
      {
        lessons: files.map((file) => ({ title: titleFromFilename(file), file })),
      },
    ],
  };
}

function titleFromFilename(path: string): string {
  const name = basename(path).replace(/\.(md|markdown|html?)$/i, "");
  const cleaned = name.replace(/^[\s\d._-]+/, "").replace(/[-_]+/g, " ").trim();
  return cleaned || name;
}
