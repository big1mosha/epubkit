import { Epub, formatBytes } from "@epubkit/core";
import { readBinary, writeBinary, exists, fail, EXIT } from "../io.ts";
import type { Output } from "../io.ts";

export async function extractCommand(
  file: string,
  options: { out?: string; force?: boolean },
  out: Output,
): Promise<void> {
  const epub = await Epub.open(file);
  const target = options.out ?? file.replace(/\.epub$/i, "");
  if (await exists(target)) {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(target).catch(() => []);
    if (entries.length > 0 && !options.force) {
      fail(`Output directory is not empty: ${target} (use --force)`, EXIT.usage);
    }
  }

  let bytes = 0;
  for (const [name, data] of epub.entries) {
    await writeBinary(`${target}/${name}`, data);
    bytes += data.byteLength;
  }
  out.info(`Extracted ${epub.entries.size} files (${formatBytes(bytes)}) to ${target}`);
}

export async function packCommand(
  directory: string,
  options: { out?: string; force?: boolean; validate?: boolean },
  out: Output,
): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const { writeZip } = await import("@epubkit/core");
  const { join } = await import("node:path");

  const files: { name: string; data: Uint8Array; store?: boolean }[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path, name);
      } else if (entry.isFile()) {
        if (name === "mimetype") continue;
        files.push({ name, data: await readBinary(path) });
      }
    }
  };
  await walk(directory, "");

  const mimetypePath = join(directory, "mimetype");
  const mimetype = (await exists(mimetypePath))
    ? await readBinary(mimetypePath)
    : new TextEncoder().encode("application/epub+zip");

  const ordered = [{ name: "mimetype", data: mimetype, store: true }, ...files];
  const data = writeZip(ordered);
  const target = options.out ?? `${directory.replace(/\/+$/, "")}.epub`;
  await writeBinary(target, data);
  out.info(`Packed ${ordered.length} files into ${target} (${formatBytes(data.byteLength)})`);

  if (options.validate) {
    const { validateEpub } = await import("@epubkit/core");
    const report = validateEpub(data);
    for (const issue of report.errors) out.error(`${issue.code}: ${issue.message}`);
    if (!report.ok) fail("Validation failed", EXIT.invalid);
  }
}
