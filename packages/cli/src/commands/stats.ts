import { Epub, formatBytes, htmlToText } from "@epubkit/core";
import type { Output } from "../io.ts";

export async function statsCommand(file: string, options: { json?: boolean }, out: Output): Promise<void> {
  const epub = await Epub.open(file);
  let words = 0;
  let characters = 0;
  let largest = { path: "", words: 0 };

  for (const entry of epub.spineItems()) {
    if (!entry.item.mediaType.includes("html")) continue;
    if (entry.item.properties.includes("nav")) continue;
    const text = htmlToText(epub.readText(entry.path));
    const count = text ? text.split(/\s+/).length : 0;
    words += count;
    characters += text.length;
    if (count > largest.words) largest = { path: entry.path, words: count };
  }

  const images = epub.imageItems();
  const bytes = [...epub.entries.values()].reduce((total, data) => total + data.byteLength, 0);
  const minutes = Math.max(1, Math.round(words / 200));
  const stats = {
    file,
    title: epub.title,
    words,
    characters,
    readingMinutes: minutes,
    spine: epub.spineItems().length,
    images: images.length,
    imageBytes: images.reduce((total, image) => total + image.size, 0),
    bytes,
    largestChapter: largest,
  };

  if (options.json) {
    out.json(stats);
    return;
  }
  out.info(`${out.bold("Words")}      ${words}`);
  out.info(`${out.bold("Characters")} ${characters}`);
  out.info(`${out.bold("Reading")}    ~${minutes} min`);
  out.info(`${out.bold("Spine")}      ${stats.spine} documents`);
  out.info(`${out.bold("Images")}     ${stats.images} (${formatBytes(stats.imageBytes)})`);
  out.info(`${out.bold("Archive")}    ${formatBytes(bytes)}`);
  if (largest.path) {
    out.info(`${out.bold("Longest")}    ${largest.path} (${largest.words} words)`);
  }
}
