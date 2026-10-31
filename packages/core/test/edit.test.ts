import { describe, expect, test } from "bun:test";
import {
  Epub,
  addPage,
  buildEpub,
  finalizeEpub,
  mergeEpubs,
  removePage,
  replaceImage,
  replacePage,
  setTocLabel,
  updateMetadata,
  validateEpub,
  type BookInput,
} from "../src/index.ts";

const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x54, 0xbf, 0xff, 0xd9,
]);

function book(title: string, chapterTitle: string): BookInput {
  return {
    title,
    authors: ["লেখক"],
    language: "bn",
    parts: [{ lessons: [{ title: chapterTitle, html: `<p>${title} এর লেখা।</p>` }] }],
  };
}

describe("mergeEpubs", () => {
  test("merges books into one valid EPUB", async () => {
    const first = Epub.fromBytes(buildEpub(book("প্রথম বই", "এক")).data);
    const second = Epub.fromBytes(buildEpub(book("দ্বিতীয় বই", "দুই")).data);

    const merged = mergeEpubs([first, second], { title: "সংকলন" });
    const epub = Epub.fromBytes(merged);
    expect(epub.title).toBe("সংকলন");
    const report = validateEpub(merged);
    expect(report.errors.map((issue) => issue.code)).toEqual([]);

    const toc = epub.toc();
    expect(toc.map((entry) => entry.label)).toEqual(["প্রথম বই", "দ্বিতীয় বই"]);
    expect(toc[0]?.children.length).toBeGreaterThan(0);
  });

  test("flat merge concatenates top-level entries", async () => {
    const first = Epub.fromBytes(buildEpub(book("এক", "অধ্যায় এক")).data);
    const second = Epub.fromBytes(buildEpub(book("দুই", "অধ্যায় দুই")).data);
    const merged = mergeEpubs([first, second], { flat: true });
    const epub = Epub.fromBytes(merged);
    expect(epub.toc().some((entry) => entry.label === "অধ্যায় এক")).toBe(true);
    expect(epub.toc().some((entry) => entry.label === "অধ্যায় দুই")).toBe(true);
  });
});

describe("page operations", () => {
  test("replaces, adds and removes pages", () => {
    const epub = Epub.fromBytes(buildEpub(book("বই", "মূল অধ্যায়")).data);
    const spine = epub.spineItems();
    const target = spine[spine.length - 1]!;

    replacePage(epub, {
      at: target.path,
      html: "<p>নতুন লেখা।</p>",
      title: "নতুন নাম",
    });
    expect(epub.readText(target.path)).toContain("নতুন লেখা।");

    addPage(epub, {
      after: target.path,
      html: "<p>যোগ করা পাতা।</p>",
      title: "যোগ",
    });
    let bytes = finalizeEpub(epub);
    let reopened = Epub.fromBytes(bytes);
    expect(reopened.spineItems().length).toBe(spine.length + 1);
    expect(reopened.toc().some((entry) => entry.label === "যোগ")).toBe(true);

    const added = reopened.spineItems().find((entry) => entry.path.includes("page"));
    expect(added).toBeDefined();
    removePage(reopened, { at: added!.path });
    bytes = finalizeEpub(reopened);
    reopened = Epub.fromBytes(bytes);
    expect(reopened.spineItems().length).toBe(spine.length);
    expect(validateEpub(bytes).errors.map((issue) => issue.code)).toEqual([]);
  });

  test("replaces an image and rewrites references", () => {
    const epub = Epub.fromBytes(
      buildEpub({
        title: "ছবি",
        cover: undefined,
        parts: [
          {
            lessons: [
              {
                title: "ছবি",
                html: '<p><img src="../images/pic.png" alt=""/></p>',
              },
            ],
          },
        ],
      }).data,
    );

    epub.setEntry("OEBPS/images/pic.png", jpeg);
    epub.opf.manifest.push({
      id: "pic",
      href: "images/pic.png",
      mediaType: "image/png",
      properties: [],
    });

    const result = replaceImage(epub, { at: "images/pic.png", data: jpeg });
    expect(result.path).toBe("OEBPS/images/pic.jpg");
    expect(epub.entries.has("OEBPS/images/pic.jpg")).toBe(true);
    const chapter = epub
      .spineItems()
      .find((entry) => entry.path.includes("ch-"))
      ?.path;
    expect(chapter).toBeDefined();
    expect(epub.readText(chapter!)).toContain("pic.jpg");
  });
});

describe("metadata and toc", () => {
  test("updates metadata and toc labels", () => {
    const epub = Epub.fromBytes(buildEpub(book("পুরনো", "অধ্যায়")).data);
    updateMetadata(epub, { title: "নতুন", subjects: ["বিষয়"] });
    const chapter = epub.toc().find((entry) => entry.label === "অধ্যায়");
    expect(chapter).toBeDefined();
    expect(setTocLabel(epub, chapter!.href, "নতুন অধ্যায়")).toBe(true);

    const bytes = finalizeEpub(epub);
    const reopened = Epub.fromBytes(bytes);
    expect(reopened.title).toBe("নতুন");
    expect(reopened.opf.metadata.subjects).toEqual(["বিষয়"]);
    expect(reopened.toc().some((entry) => entry.label === "নতুন অধ্যায়")).toBe(true);
    expect(validateEpub(bytes).errors.map((issue) => issue.code)).toEqual([]);
  });
});
