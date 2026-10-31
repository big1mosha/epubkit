import { Epub, finalizeEpub, resolveTocHref, setTocLabel } from "@epubkit/core";
import { EXIT, fail } from "../io.ts";
import type { Output } from "../io.ts";
import { printToc, tocToJson } from "./info.ts";
import { finishOutput, prepareOutput, type OutputFlags } from "./output.ts";

export async function tocCommand(
  file: string,
  options: OutputFlags & { json?: boolean; set?: string | string[] },
  out: Output,
): Promise<void> {
  const epub = await Epub.open(file);
  const sets = options.set === undefined ? [] : Array.isArray(options.set) ? options.set : [options.set];

  if (sets.length === 0) {
    const toc = epub.toc();
    if (options.json) out.json(tocToJson(toc));
    else printToc(toc, out);
    return;
  }

  for (const pair of sets) {
    const index = pair.indexOf("=");
    if (index === -1) fail(`Expected href=label, got: ${pair}`, EXIT.usage);
    const wanted = pair.slice(0, index).trim();
    const label = pair.slice(index + 1).trim();
    const href = resolveTocHref(epub, wanted);
    if (!href) fail(`TOC entry not found: ${wanted}`, EXIT.usage);
    if (!setTocLabel(epub, href, label)) fail(`Could not update TOC entry: ${wanted}`, EXIT.usage);
    out.info(`Updated ${href} -> ${label}`);
  }

  const data = finalizeEpub(epub);
  const target = await prepareOutput(file, options, "edited");
  await finishOutput(target, data, options, out);
}
