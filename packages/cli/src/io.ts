import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const EXIT = {
  ok: 0,
  general: 1,
  usage: 2,
  auth: 3,
  partial: 4,
  offline: 5,
  invalid: 6,
  drm: 7,
} as const;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT.general) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function fail(message: string, exitCode: number = EXIT.general): never {
  throw new CliError(message, exitCode);
}

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

export function createOutput(options: OutputOptions) {
  const color = !options.noColor && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const paint = (code: string, value: string): string => (color ? `\x1b[${code}m${value}\x1b[0m` : value);

  return {
    color,
    bold: (value: string) => paint("1", value),
    dim: (value: string) => paint("2", value),
    red: (value: string) => paint("31", value),
    green: (value: string) => paint("32", value),
    yellow: (value: string) => paint("33", value),
    cyan: (value: string) => paint("36", value),
    info: (value: string) => {
      if (!options.quiet) process.stdout.write(`${value}\n`);
    },
    warn: (value: string) => process.stderr.write(`${paint("33", "warning:")} ${value}\n`),
    error: (value: string) => process.stderr.write(`${paint("31", "error:")} ${value}\n`),
    json: (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
  };
}

export type Output = ReturnType<typeof createOutput>;

export async function readBinary(path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") fail(`File not found: ${path}`);
    fail(`Cannot read ${path}: ${(cause as Error).message}`);
  }
}

export async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await readBinary(path));
}

export async function writeBinary(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, data);
  await rename(temp, path);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function ensureWritable(path: string, force: boolean): Promise<void> {
  if (!force && (await exists(path))) {
    fail(`Output already exists: ${path} (use --force to overwrite)`);
  }
}

export function defaultOutput(input: string, suffix: string): string {
  const base = input.replace(/\.epub$/i, "");
  return `${base}-${suffix}.epub`;
}

export function parseNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`Invalid number for ${name}: ${value}`, EXIT.usage);
  return parsed;
}

export function collect(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function joinPath(...parts: string[]): string {
  return join(...parts);
}
