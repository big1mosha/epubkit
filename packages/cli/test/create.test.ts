import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Epub, validateEpub } from "@epubkit/core";
import { createCommand } from "../src/commands/create.ts";
import { createOutput } from "../src/io.ts";

const dirs: string[] = [];
const out = createOutput({ quiet: true });

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "epubkit-create-"));
  dirs.push(dir);
  return dir;
}

async function titleOf(file: string): Promise<string | undefined> {
  const book = Epub.fromBytes(new Uint8Array(await readFile(file)));
  return book.opf.metadata.title;
}

describe("create", () => {
  test("builds a book from a directory of chapter files", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "01-এক.md"), "# এক\n\nপ্রথম লেখা।\n");
    await writeFile(join(dir, "02-দুই.md"), "# দুই\n\nদ্বিতীয় লেখা।\n");
    const outFile = join(dir, "out.epub");

    await createCommand(dir, { out: outFile, title: "ডেমো" }, out);

    const book = Epub.fromBytes(new Uint8Array(await readFile(outFile)));
    expect(book.opf.metadata.title).toBe("ডেমো");
    expect(validateEpub(new Uint8Array(await readFile(outFile))).ok).toBe(true);
    expect(book.opf.spine.length).toBeGreaterThanOrEqual(2);
  });

  test("takes the title from a single Markdown heading", async () => {
    const dir = await tempDir();
    const file = join(dir, "chapter.md");
    await writeFile(file, "# শিরোনাম\n\nলেখা।\n");
    const outFile = join(dir, "single.epub");

    await createCommand(file, { out: outFile }, out);

    expect(await titleOf(outFile)).toBe("শিরোনাম");
  });

  test("reads manifest.json and book.json", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "a.md"), "# অধ্যায়\n\nলেখা।\n");
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        title: "ম্যানিফেস্ট",
        parts: [{ title: "অংশ", lessons: [{ title: "অধ্যায়", file: "a.md" }] }],
      }),
    );
    const outFile = join(dir, "manifest.epub");

    await createCommand(dir, { out: outFile }, out);
    expect(await titleOf(outFile)).toBe("ম্যানিফেস্ট");
  });

  test("rejects a directory without chapters or a manifest", async () => {
    const dir = await tempDir();
    await expect(createCommand(dir, {}, out)).rejects.toThrow(/No book\.json/);
  });
});
