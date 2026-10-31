import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
import { EXIT, fail, isDirectory, readBinary, readText, writeBinary } from "../io.ts";
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
  const directory = (await isDirectory(input)) ? input : dirname(input);
  const manifestPath = (await isDirectory(input)) ? join(input, "book.json") : input;
  const manifest = JSON.parse(await readText(manifestPath)) as Manifest;

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
