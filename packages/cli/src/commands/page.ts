import { Epub, addPage, finalizeEpub, removePage, replacePage, type TocEntry } from "@epubkit/core";
import { EXIT, fail, readText } from "../io.ts";
import type { Output } from "../io.ts";
import { finishOutput, prepareOutput, type OutputFlags } from "./output.ts";

function labelMap(toc: TocEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (entries: TocEntry[]): void => {
    for (const entry of entries) {
      map.set(entry.href, entry.label);
      walk(entry.children);
    }
  };
  walk(toc);
  return map;
}

export async function pageListCommand(file: string, options: { json?: boolean }, out: Output): Promise<void> {
  const epub = await Epub.open(file);
  const labels = labelMap(epub.toc());
  const rows = epub.spineItems().map((entry, index) => ({
    index: index + 1,
    href: entry.path,
    title: labels.get(entry.path) ?? "",
    bytes: epub.entries.get(entry.path)?.byteLength ?? 0,
  }));

  if (options.json) {
    out.json(rows);
    return;
  }
  const width = Math.max(1, ...rows.map((row) => row.href.length));
  for (const row of rows) {
    out.info(
      `${String(row.index).padStart(3)}  ${row.href.padEnd(width)}  ${row.title}  ${out.dim(`${row.bytes} B`)}`,
    );
  }
}

export async function pageCommand(
  action: string,
  file: string,
  options: OutputFlags & {
    at?: string;
    with?: string;
    after?: string;
    file?: string;
    title?: string;
    json?: boolean;
  },
  out: Output,
): Promise<void> {
  if (action === "list") {
    await pageListCommand(file, { json: options.json }, out);
    return;
  }

  const epub = await Epub.open(file);
  let result: { path: string };

  if (action === "replace") {
    if (!options.at) fail("--at is required", EXIT.usage);
    if (!options.with) fail("--with is required", EXIT.usage);
    const html = await readText(options.with);
    result = replacePage(epub, { at: options.at, html, title: options.title });
  } else if (action === "add") {
    if (!options.after) fail("--after is required", EXIT.usage);
    if (!options.file) fail("--file is required", EXIT.usage);
    const html = await readText(options.file);
    result = addPage(epub, { after: options.after, html, title: options.title });
  } else if (action === "remove") {
    if (!options.at) fail("--at is required", EXIT.usage);
    result = removePage(epub, { at: options.at });
  } else {
    fail(`Unknown page action: ${action}`, EXIT.usage);
  }

  const data = finalizeEpub(epub);
  out.info(`${action}: ${result.path}`);
  const target = await prepareOutput(file, options, "edited");
  await finishOutput(target, data, options, out);
}
