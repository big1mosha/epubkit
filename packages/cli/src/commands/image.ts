import { Epub, finalizeEpub, inspectImage, replaceImage } from "@epubkit/core";
import { EXIT, fail, readBinary } from "../io.ts";
import type { Output } from "../io.ts";
import { finishOutput, prepareOutput, type OutputFlags } from "./output.ts";

export async function imageListCommand(file: string, options: { json?: boolean }, out: Output): Promise<void> {
  const epub = await Epub.open(file);
  const rows = epub.imageItems().map((image, index) => {
    const info = inspectImage(image.data);
    return {
      index: index + 1,
      href: image.path,
      mediaType: image.item.mediaType,
      bytes: image.size,
      width: info?.width,
      height: info?.height,
      cover: image.item.properties.includes("cover-image"),
    };
  });

  if (options.json) {
    out.json(rows);
    return;
  }
  for (const row of rows) {
    out.info(
      `${String(row.index).padStart(3)}  ${row.href}  ${out.dim(
        `${row.mediaType} ${row.width ?? "?"}x${row.height ?? "?"} ${row.bytes} B${row.cover ? " cover" : ""}`,
      )}`,
    );
  }
}

export async function imageCommand(
  action: string,
  file: string,
  options: OutputFlags & { at?: string; with?: string; json?: boolean },
  out: Output,
): Promise<void> {
  if (action === "list") {
    await imageListCommand(file, { json: options.json }, out);
    return;
  }
  if (action !== "replace") fail(`Unknown image action: ${action}`, EXIT.usage);
  if (!options.at) fail("--at is required", EXIT.usage);
  if (!options.with) fail("--with is required", EXIT.usage);

  const epub = await Epub.open(file);
  const data = await readBinary(options.with);
  const result = replaceImage(epub, { at: options.at, data });
  const bytes = finalizeEpub(epub);
  out.info(`Replaced image: ${result.path}`);

  const target = await prepareOutput(file, options, "edited");
  await finishOutput(target, bytes, options, out);
}
