import { describe, expect, test } from "bun:test";
import {
  Epub,
  buildEpub,
  coverFromBytes,
  generateCover,
  sanitizeHtml,
  validateEpub,
  type BookInput,
} from "../src/index.ts";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
  0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
  0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function sampleBook(overrides: Partial<BookInput> = {}): BookInput {
  return {
    title: "পরীক্ষার বই",
    authors: ["লেখক"],
    language: "bn",
    source: "https://example.com/books/test/",
    includeColophon: true,
    cover: coverFromBytes(png) ?? undefined,
    parts: [
      {
        title: "প্রথম অংশ",
        lessons: [
          {
            title: "প্রথম অধ্যায়",
            html: "<p>প্রথম প্যারাগ্রাফ।</p><p>দ্বিতীয় প্যারাগ্রাফ।</p>",
          },
          {
            title: "দ্বিতীয় অধ্যায়",
            html: "<p>আরেকটি প্যারাগ্রাফ।</p>",
            topics: [
              { title: "০১. প্রথম বিষয়", html: "<p>বিষয়ের লেখা।</p>" },
              { title: "০২. দ্বিতীয় বিষয়", html: "<p>আরও লেখা।</p>" },
            ],
          },
        ],
      },
      {
        title: "দ্বিতীয় অংশ",
        lessons: [{ title: "তৃতীয় অধ্যায়", html: "<p>শেষ অধ্যায়।</p>" }],
      },
    ],
    ...overrides,
  };
}

describe("buildEpub", () => {
  test("produces a structurally valid EPUB", () => {
    const result = buildEpub(sampleBook());
    const report = validateEpub(result.data);
    const errors = report.errors.map((issue) => `${issue.code}: ${issue.message}`);
    expect(errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test("mimetype is first and stored", async () => {
    const result = buildEpub(sampleBook());
    const epub = Epub.fromBytes(result.data);
    expect(epub.title).toBe("পরীক্ষার বই");
    expect(epub.entries.has("mimetype")).toBe(true);
  });

  test("builds a nested table of contents", () => {
    const result = buildEpub(sampleBook());
    const epub = Epub.fromBytes(result.data);
    const toc = epub.toc();
    expect(toc[0]?.label).toBe("প্রচ্ছদ");
    const parts = toc.filter((entry) => entry.label.includes("অংশ"));
    expect(parts.length).toBe(2);
    expect(parts[0]?.children[1]?.children.length).toBe(2);
  });

  test("uses the part page as the chapter page for single same-title lessons", () => {
    const result = buildEpub({
      title: "একক",
      parts: [
        {
          title: "একমাত্র অধ্যায়",
          lessons: [{ title: "একমাত্র অধ্যায়", html: "<p>লেখা।</p>" }],
        },
      ],
    });
    const epub = Epub.fromBytes(result.data);
    const toc = epub.toc();
    const part = toc.find((entry) => entry.label === "একমাত্র অধ্যায়");
    expect(part).toBeDefined();
    expect(part?.href).toContain("part-001.xhtml");
  });

  test("splits long chapters", () => {
    const paragraphs = Array.from({ length: 400 }, (_, index) => `<p>অনুচ্ছেদ ${index} ${"ক".repeat(40)}</p>`);
    const result = buildEpub({
      title: "বড়",
      splitSizeKb: 10,
      parts: [{ lessons: [{ title: "বড় অধ্যায়", html: paragraphs.join("") }] }],
    });
    const epub = Epub.fromBytes(result.data);
    const chapters = epub.spineItems().filter((entry) => entry.path.includes("ch-"));
    expect(chapters.length).toBeGreaterThan(1);
  });

  test("generated cover is a usable asset", async () => {
    const cover = await generateCover({ title: "বাংলা বই", authors: ["লেখক"] });
    expect(cover.data.byteLength).toBeGreaterThan(100);
    expect(["image/jpeg", "image/svg+xml"]).toContain(cover.mediaType);
  });
});

describe("sanitizeHtml", () => {
  test("removes buttons and scripts", () => {
    const html = '<p>টেক্সট</p><button class="simplefavorite-button">♥</button><script>alert(1)</script>';
    const clean = sanitizeHtml(html);
    expect(clean).not.toContain("button");
    expect(clean).not.toContain("script");
    expect(clean).toContain("টেক্সট");
  });

  test("resolves lazy images and drops placeholders", () => {
    const html =
      '<p><img src="data:image/svg+xml;base64,xx" data-src="/img/a.jpg" alt="ছবি"/></p>' +
      '<p><img src="data:image/svg+xml;base64,xx"/></p>';
    const clean = sanitizeHtml(html, { baseUrl: "https://example.com/page/" });
    expect(clean).toContain('src="https://example.com/img/a.jpg"');
    expect(clean).toContain('alt="ছবি"');
    expect((clean.match(/<img/g) ?? []).length).toBe(1);
  });

  test("removes a duplicated leading title", () => {
    const clean = sanitizeHtml('<p style="text-align:center"><strong>শিরোনাম</strong></p><p>লেখা।</p>', {
      title: "শিরোনাম",
    });
    expect(clean).not.toContain("শিরোনাম");
    expect(clean).toContain("লেখা।");
  });

  test("unwraps unknown tags and keeps alignment", () => {
    const clean = sanitizeHtml('<div class="x"><p style="color:red;text-align:center">লেখা</p></div>');
    expect(clean).toContain('style="text-align: center"');
    expect(clean).not.toContain("color");
    expect(clean).not.toContain("class=");
  });
});

describe("buildEpub extras", () => {
  test("embeds content images and several font faces", () => {
    const font = (filename: string) => ({
      data: new Uint8Array([0, 1, 2, 3]),
      filename,
      family: "Noto Serif Bengali",
      weight: "400 700",
    });

    const result = buildEpub(
      sampleBook({
        cover: undefined,
        fonts: [font("noto-serif-bengali.woff2"), font("noto-serif-latin.woff2")],
        images: [
          { href: "images/a.png", mediaType: "image/png", data: png },
          { href: "images/a.png", mediaType: "image/png", data: png },
        ],
        parts: [
          {
            lessons: [
              {
                title: "ছবি",
                html: '<p><img src="../images/a.png" alt=""/></p>',
              },
            ],
          },
        ],
      }),
    );

    expect(result.files).toContain("OEBPS/images/a.png");
    expect(result.files).toContain("OEBPS/fonts/noto-serif-bengali.woff2");
    expect(result.files).toContain("OEBPS/fonts/noto-serif-latin.woff2");
    expect(result.files.filter((file) => file === "OEBPS/images/a.png")).toHaveLength(1);

    const book = Epub.fromBytes(result.data);
    const opf = book.opf;
    expect(opf.manifest.filter((item) => item.href === "images/a.png")).toHaveLength(1);
    expect(opf.manifest.filter((item) => item.href.startsWith("fonts/"))).toHaveLength(2);
    expect(validateEpub(result.data).ok).toBe(true);
  });
});
