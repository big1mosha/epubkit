import { validateEpub } from "@epubkit/core";
import { spawnSync } from "node:child_process";
import { EXIT, fail, readBinary } from "../io.ts";
import type { Output } from "../io.ts";

export async function validateCommand(
  file: string,
  options: { json?: boolean; epubcheck?: boolean },
  out: Output,
): Promise<void> {
  const data = await readBinary(file);
  const report = validateEpub(data);

  if (options.epubcheck) {
    const probe = spawnSync("epubcheck", ["--version"], { encoding: "utf8" });
    if (probe.error) {
      fail("epubcheck was not found on PATH", EXIT.usage);
    }
    const result = spawnSync("epubcheck", [file], { encoding: "utf8" });
    const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (options.json) {
      out.json({ ...report, epubcheck: { status: result.status, output: text } });
    } else {
      out.info(text);
    }
    if (result.status !== 0) process.exitCode = EXIT.invalid;
  } else if (options.json) {
    out.json(report);
  } else {
    for (const issue of report.errors) out.error(`${issue.code}: ${issue.message}${issue.file ? ` [${issue.file}]` : ""}`);
    for (const issue of report.warnings) out.warn(`${issue.code}: ${issue.message}${issue.file ? ` [${issue.file}]` : ""}`);
    for (const issue of report.infos) out.info(out.dim(`${issue.code}: ${issue.message}`));
    if (report.ok) {
      out.info(
        out.green(
          `Valid EPUB (${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"})`,
        ),
      );
    }
  }

  if (!report.ok) {
    if (!options.json) out.error(`Validation failed with ${report.errors.length} error(s)`);
    if (!options.epubcheck) process.exitCode = EXIT.invalid;
  }
}
