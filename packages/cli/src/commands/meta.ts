import {
  Epub,
  coverFromBytes,
  finalizeEpub,
  setCover,
  updateMetadata,
  type OpfMetadata,
} from "@epubkit/core";
import { EXIT, fail, readBinary } from "../io.ts";
import type { Output } from "../io.ts";
import { finishOutput, prepareOutput, type OutputFlags } from "./output.ts";

export async function metaCommand(
  file: string,
  options: OutputFlags & {
    title?: string;
    author?: string | string[];
    language?: string;
    publisher?: string;
    date?: string;
    description?: string;
    subject?: string | string[];
    series?: string;
    seriesIndex?: string | number;
    identifier?: string;
    rights?: string;
    source?: string;
    cover?: string;
  },
  out: Output,
): Promise<void> {
  const epub = await Epub.open(file);
  const changes: Partial<OpfMetadata> = {};

  if (options.title !== undefined) changes.title = options.title;
  if (options.language !== undefined) changes.language = options.language;
  if (options.publisher !== undefined) changes.publisher = options.publisher;
  if (options.date !== undefined) changes.date = options.date;
  if (options.description !== undefined) changes.description = options.description;
  if (options.series !== undefined) changes.series = options.series;
  if (options.identifier !== undefined) changes.identifier = options.identifier;
  if (options.rights !== undefined) changes.rights = options.rights;
  if (options.source !== undefined) changes.source = options.source;

  if (options.author !== undefined) {
    const authors = Array.isArray(options.author) ? options.author : [options.author];
    changes.creators = authors.map((name) => ({ name }));
  }
  if (options.subject !== undefined) {
    changes.subjects = Array.isArray(options.subject) ? options.subject : [options.subject];
  }
  if (options.seriesIndex !== undefined) {
    const index = Number(options.seriesIndex);
    if (!Number.isFinite(index)) fail(`Invalid series index: ${options.seriesIndex}`, EXIT.usage);
    changes.seriesIndex = index;
  }

  if (Object.keys(changes).length === 0 && !options.cover) {
    fail("No metadata changes were given", EXIT.usage);
  }

  updateMetadata(epub, changes);
  if (options.cover) {
    const asset = coverFromBytes(await readBinary(options.cover));
    if (!asset) fail(`Unsupported cover image: ${options.cover}`, EXIT.usage);
    setCover(epub, asset);
  }

  const data = finalizeEpub(epub);
  const target = await prepareOutput(file, options, "meta");
  await finishOutput(target, data, options, out);
}
