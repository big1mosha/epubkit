#!/usr/bin/env bun
import cac from "cac";
import { CliError, EXIT, createOutput, fail } from "./io.ts";
import type { OutputOptions } from "./io.ts";
import { infoCommand } from "./commands/info.ts";
import { extractCommand, packCommand } from "./commands/archive.ts";
import { validateCommand } from "./commands/validate.ts";
import { createCommand } from "./commands/create.ts";
import { mergeCommand } from "./commands/merge.ts";
import { pageCommand } from "./commands/page.ts";
import { imageCommand } from "./commands/image.ts";
import { metaCommand } from "./commands/meta.ts";
import { tocCommand } from "./commands/toc.ts";
import { statsCommand } from "./commands/stats.ts";

const cli = cac("epubkit");

function outputOptions(options: Record<string, unknown>): OutputOptions {
  return {
    json: Boolean(options.json),
    quiet: Boolean(options.quiet),
    noColor: options.color === false,
  };
}

async function run(
  action: () => Promise<void>,
  options: Record<string, unknown>,
): Promise<void> {
  const out = createOutput(outputOptions(options));
  try {
    await action();
  } catch (cause) {
    if (cause instanceof CliError) {
      out.error(cause.message);
      process.exitCode = cause.exitCode;
      return;
    }
    out.error(cause instanceof Error ? cause.message : String(cause));
    if (options.verbose && cause instanceof Error && cause.stack) out.error(cause.stack);
    process.exitCode = EXIT.general;
  }
}

cli
  .command("info <file>", "Show metadata, spine, cover and table of contents")
  .option("--json", "Print JSON")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => infoCommand(file, options as { json?: boolean }, createOutput(outputOptions(options))), options),
  );

cli
  .command("extract <file>", "Unzip an EPUB into a directory")
  .option("-o, --out <dir>", "Output directory")
  .option("--force", "Overwrite a non-empty directory")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => extractCommand(file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("pack <dir>", "Zip a directory into an EPUB")
  .option("-o, --out <file>", "Output EPUB")
  .option("--force", "Overwrite an existing file")
  .option("--validate", "Validate after packing")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((dir: string, options: Record<string, unknown>) =>
    run(() => packCommand(dir, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("validate <file>", "Check EPUB structure and references")
  .option("--json", "Print JSON")
  .option("--epubcheck", "Also run the epubcheck tool if installed")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => validateCommand(file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("create <input>", "Build an EPUB from book.json and HTML/Markdown files")
  .option("-o, --out <file>", "Output EPUB")
  .option("--title <title>", "Override the title")
  .option("--author <name>", "Override the author (repeatable)")
  .option("--language <code>", "Override the language")
  .option("--style <name>", "Theme: classic, minimal or none")
  .option("--cover <file>", "Use a cover image, or \"none\" to skip")
  .option("--validate", "Validate after writing")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((input: string, options: Record<string, unknown>) =>
    run(() => createCommand(input, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("merge <files...>", "Merge EPUB files in the given order")
  .option("-o, --out <file>", "Output EPUB")
  .option("--title <title>", "Merged title")
  .option("--author <name>", "Merged author (repeatable)")
  .option("--language <code>", "Merged language")
  .option("--cover <file>", "Merged cover image")
  .option("--flat", "Concatenate TOCs instead of nesting per book")
  .option("--unify-css <file>", "Apply one stylesheet to every document")
  .option("--validate", "Validate after writing")
  .option("--dry-run", "Print the merged TOC without writing")
  .option("--force", "Overwrite an existing file")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((_files: string | string[], options: Record<string, unknown>) => {
    // cac only passes the first variadic argument to the action; cli.args has them all.
    const list = cli.args.filter((arg) => typeof arg === "string" && !arg.startsWith("-"));
    return run(() => mergeCommand(list, options, createOutput(outputOptions(options))), options);
  });

cli
  .command("page <action> <file>", "List, replace, add or remove pages (action: list|replace|add|remove)")
  .option("--at <href|#index>", "Target page")
  .option("--with <file>", "Replacement HTML")
  .option("--file <file>", "HTML file to add")
  .option("--after <href|#index>", "Insert after this page")
  .option("--title <title>", "TOC label")
  .option("-o, --out <file>", "Output EPUB")
  .option("--in-place", "Overwrite the input file")
  .option("--backup", "Keep a .bak copy when editing in place")
  .option("--force", "Overwrite an existing output")
  .option("--validate", "Validate after writing")
  .option("--dry-run", "Do not write the output")
  .option("--json", "Print JSON")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((action: string, file: string, options: Record<string, unknown>) =>
    run(() => pageCommand(action, file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("image <action> <file>", "List or replace images (action: list|replace)")
  .option("--at <href|#index>", "Target image")
  .option("--with <file>", "Replacement image")
  .option("-o, --out <file>", "Output EPUB")
  .option("--in-place", "Overwrite the input file")
  .option("--backup", "Keep a .bak copy when editing in place")
  .option("--force", "Overwrite an existing output")
  .option("--validate", "Validate after writing")
  .option("--dry-run", "Do not write the output")
  .option("--json", "Print JSON")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((action: string, file: string, options: Record<string, unknown>) =>
    run(() => imageCommand(action, file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("meta <file>", "Edit EPUB metadata")
  .option("--title <title>", "dc:title")
  .option("--author <name>", "dc:creator (repeatable)")
  .option("--language <code>", "dc:language")
  .option("--publisher <name>", "dc:publisher")
  .option("--date <date>", "dc:date")
  .option("--description <text>", "dc:description")
  .option("--subject <text>", "dc:subject (repeatable)")
  .option("--series <name>", "Series name")
  .option("--series-index <n>", "Position in series")
  .option("--identifier <id>", "dc:identifier")
  .option("--rights <text>", "dc:rights")
  .option("--source <url>", "dc:source")
  .option("--cover <file>", "Replace the cover image")
  .option("-o, --out <file>", "Output EPUB")
  .option("--in-place", "Overwrite the input file")
  .option("--backup", "Keep a .bak copy when editing in place")
  .option("--force", "Overwrite an existing output")
  .option("--validate", "Validate after writing")
  .option("--dry-run", "Do not write the output")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => metaCommand(file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("toc <file>", "Print or edit the table of contents")
  .option("--set <href=label>", "Set a label (repeatable)")
  .option("--json", "Print JSON")
  .option("-o, --out <file>", "Output EPUB")
  .option("--in-place", "Overwrite the input file")
  .option("--backup", "Keep a .bak copy when editing in place")
  .option("--force", "Overwrite an existing output")
  .option("--dry-run", "Do not write the output")
  .option("--validate", "Validate after writing")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => tocCommand(file, options, createOutput(outputOptions(options))), options),
  );

cli
  .command("stats <file>", "Word count, reading time and size")
  .option("--json", "Print JSON")
  .option("--quiet", "Suppress human output")
  .option("--no-color", "Disable colors")
  .action((file: string, options: Record<string, unknown>) =>
    run(() => statsCommand(file, options, createOutput(outputOptions(options))), options),
  );

cli.help();
cli.version("0.1.0");

// Writing into `head` or a closed pipe is not an error.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });
}

async function main(): Promise<void> {
  cli.parse(process.argv, { run: false });
  const flags = process.argv.slice(2);
  const askedForHelp = flags.some((flag) => flag === "--help" || flag === "-h" || flag === "--version" || flag === "-v");
  if (!cli.matchedCommand) {
    if (!askedForHelp) cli.outputHelp();
    process.exitCode = askedForHelp ? EXIT.ok : EXIT.usage;
    return;
  }
  try {
    await cli.runMatchedCommand();
  } catch (cause) {
    if (cause instanceof CliError) {
      process.stderr.write(`error: ${cause.message}\n`);
      process.exitCode = cause.exitCode;
    } else {
      process.stderr.write(`error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
      process.exitCode = EXIT.general;
    }
  }
}

void main();
