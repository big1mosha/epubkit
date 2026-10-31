import { Epub, inspectImage, type TocEntry } from "@epubkit/core";
import { formatBytes } from "@epubkit/core";
import type { Output } from "../io.ts";

export function printToc(entries: TocEntry[], out: Output, depth = 0): void {
  for (const entry of entries) {
    out.info(`${"  ".repeat(depth)}${entry.label}  ${out.dim(entry.href)}`);
    printToc(entry.children, out, depth + 1);
  }
}

export function tocToJson(entries: TocEntry[]): unknown[] {
  return entries.map((entry) => ({
    label: entry.label,
    href: entry.href,
    fragment: entry.fragment,
    children: tocToJson(entry.children),
  }));
}

export async function infoCommand(file: string, options: { json?: boolean }, out: Output): Promise<void> {
  const epub = await Epub.open(file);
  const coverPath = epub.coverPath();
  const coverData = coverPath ? epub.entries.get(coverPath) : undefined;
  const coverInfo = coverData ? inspectImage(coverData) : null;
  const words = epub.wordCount();
  const spine = epub.spineItems();
  const toc = epub.toc();
  const images = epub.imageItems();
  const size = [...epub.entries.values()].reduce((total, data) => total + data.byteLength, 0);

  if (options.json) {
    out.json({
      file,
      title: epub.title,
      authors: epub.opf.metadata.creators.map((creator) => creator.name),
      language: epub.language,
      identifier: epub.opf.metadata.identifier,
      publisher: epub.opf.metadata.publisher,
      date: epub.opf.metadata.date,
      series: epub.opf.metadata.series,
      seriesIndex: epub.opf.metadata.seriesIndex,
      subjects: epub.opf.metadata.subjects,
      source: epub.opf.metadata.source,
      rights: epub.opf.metadata.rights,
      cover: coverPath
        ? { path: coverPath, width: coverInfo?.width, height: coverInfo?.height, bytes: coverData?.byteLength }
        : null,
      spine: spine.length,
      toc: tocToJson(toc),
      images: images.length,
      words,
      bytes: size,
      drm: epub.hasDrm(),
      encrypted: epub.hasEncryption(),
      version: epub.opf.version,
      files: epub.entries.size,
    });
    return;
  }

  const rows: Array<[string, string]> = [
    ["Title", epub.title],
    ["Authors", epub.opf.metadata.creators.map((creator) => creator.name).join(", ") || "-"],
    ["Language", epub.language],
    ["Identifier", epub.opf.metadata.identifier],
    ["Version", epub.opf.version],
    ["Publisher", epub.opf.metadata.publisher ?? "-"],
    ["Date", epub.opf.metadata.date ?? "-"],
    ["Series", epub.opf.metadata.series ?? "-"],
    ["Subjects", epub.opf.metadata.subjects.join(", ") || "-"],
    ["Source", epub.opf.metadata.source ?? "-"],
    ["Cover", coverPath ? `${coverPath} (${coverInfo?.width ?? "?"}x${coverInfo?.height ?? "?"})` : "none"],
    ["Spine", `${spine.length} documents`],
    ["TOC", `${toc.length} top-level entries`],
    ["Images", `${images.length} (${formatBytes(images.reduce((total, image) => total + image.size, 0))})`],
    ["Words", `${words} (~${Math.max(1, Math.round(words / 200))} min)`],
    ["Archive", `${epub.entries.size} files, ${formatBytes(size)}`],
    ["DRM", epub.hasDrm() ? out.red("yes") : "no"],
    ["Encrypted", epub.hasEncryption() ? "yes (META-INF/encryption.xml)" : "no"],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    out.info(`${out.bold(label.padEnd(width))}  ${value}`);
  }

  if (toc.length > 0) {
    out.info("");
    out.info(out.bold("Contents"));
    printToc(toc, out, 1);
  }
}
