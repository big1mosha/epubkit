import { copyFile } from "node:fs/promises";
import { validateEpub } from "@epubkit/core";
import { EXIT, defaultOutput, ensureWritable, fail, writeBinary } from "../io.ts";
import type { Output } from "../io.ts";

export interface OutputFlags {
  out?: string;
  inPlace?: boolean;
  force?: boolean;
  backup?: boolean;
  validate?: boolean;
  dryRun?: boolean;
}

export async function prepareOutput(
  input: string,
  options: OutputFlags,
  suffix: string,
): Promise<string> {
  if (options.inPlace) {
    if (options.backup) await copyFile(input, `${input}.bak`);
    return input;
  }
  const target = options.out ?? defaultOutput(input, suffix);
  await ensureWritable(target, options.force ?? false);
  return target;
}

export async function finishOutput(
  target: string,
  data: Uint8Array,
  options: OutputFlags,
  out: Output,
): Promise<void> {
  if (options.dryRun) {
    out.info(`Would write ${target} (${data.byteLength} bytes)`);
    return;
  }
  await writeBinary(target, data);
  out.info(`Wrote ${target} (${data.byteLength} bytes)`);

  if (options.validate) {
    const report = validateEpub(data);
    for (const issue of report.errors) out.error(`${issue.code}: ${issue.message}`);
    if (!report.ok) fail("Validation failed", EXIT.invalid);
  }
}
