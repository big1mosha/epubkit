import {
  Epub,
  coverFromBytes,
  mergeEpubs,
  validateEpub,
  type MergeOptions,
} from "@epubkit/core";
import { EXIT, ensureWritable, fail, readBinary, readText, writeBinary } from "../io.ts";
import type { Output } from "../io.ts";
import { printToc } from "./info.ts";

export async function mergeCommand(
  files: string[],
  options: {
    out?: string;
    title?: string;
    author?: string | string[];
    language?: string;
    cover?: string;
    flat?: boolean;
    unifyCss?: string;
    validate?: boolean;
    dryRun?: boolean;
    force?: boolean;
  },
  out: Output,
): Promise<void> {
  if (files.length < 2) fail("Merge needs at least two EPUB files", EXIT.usage);

  const books: Epub[] = [];
  for (const file of files) {
    books.push(await Epub.open(file));
  }

  const mergeOptions: MergeOptions = {
    title: options.title,
    language: options.language,
    flat: options.flat,
  };
  if (options.author) {
    mergeOptions.authors = Array.isArray(options.author) ? options.author : [options.author];
  }
  if (options.cover) {
    const asset = coverFromBytes(await readBinary(options.cover));
    if (!asset) fail(`Unsupported cover image: ${options.cover}`, EXIT.usage);
    mergeOptions.cover = asset;
  }
  if (options.unifyCss) {
    mergeOptions.unifyCss = await readText(options.unifyCss);
  }

  const data = mergeEpubs(books, mergeOptions);
  const merged = Epub.fromBytes(data);

  if (options.dryRun) {
    out.info(`Would merge ${books.length} books into ${merged.spineItems().length} spine items`);
    printToc(merged.toc(), out);
    return;
  }

  const target = options.out ?? "merged.epub";
  await ensureWritable(target, options.force ?? false);
  await writeBinary(target, data);
  out.info(`Merged ${books.length} books into ${target}`);

  if (options.validate) {
    const report = validateEpub(data);
    for (const issue of report.errors) out.error(`${issue.code}: ${issue.message}`);
    if (!report.ok) fail("Validation failed", EXIT.invalid);
  }
}
