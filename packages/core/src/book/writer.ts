import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { writeZip, type ZipEntry } from "../archive/zip.ts";
import { buildOpf, type ManifestItem, type OpfPackage, type SpineItem } from "../archive/opf.ts";
import { sanitizeHtml } from "../html/sanitize.ts";
import { serializeNode, type DomNode } from "../html/serialize.ts";
import { xhtmlDocument } from "../html/xhtml.ts";
import { buildNavDocument, buildNcxDocument } from "./nav-build.ts";
import { themeCss, type ThemeName } from "../style/themes.ts";
import { escapeAttr, escapeXml, isoNow, toBengaliNumber, toLocalNumber } from "../util/text.ts";
import { labelsFor, type BookInput, type BuildResult, type ChapterInput, type PartInput } from "./types.ts";

interface NavEntry {
  label: string;
  href: string;
  children: NavEntry[];
}

interface PageFile {
  href: string;
  id: string;
  title: string;
  body: string;
  bodyClass: string;
  inSpine: boolean;
  nav?: string;
}

const OEBPS = "OEBPS";

function page(bodyClass: string, body: string, lang: string, title: string, cssHref: string): string {
  return xhtmlDocument({ language: lang, title, cssHref, bodyClass, body });
}

/** Extract the body of a full XHTML document; otherwise return the fragment. */
function fragmentOf(html: string): string {
  const trimmed = html.trim();
  if (!/^<\?xml|^<!DOCTYPE|^<html[\s>]/i.test(trimmed)) return trimmed;
  const $ = cheerio.load(trimmed, { xmlMode: false });
  return $("body").html() ?? "";
}

function splitFragment(html: string, maxBytes: number): string[] {
  if (!html.trim()) return [""];
  if (Buffer.byteLength(html, "utf8") <= maxBytes) return [html];

  const $ = cheerio.load(`<div id="__ek_split">${html}</div>`, null, false);
  const root = $("#__ek_split")[0] as unknown as DomNode | undefined;
  const children = root?.children ?? [];
  const chunks: string[] = [];
  let current = "";

  for (const child of children) {
    const piece = serializeNode(child);
    if (current && Buffer.byteLength(current + piece, "utf8") > maxBytes) {
      chunks.push(current);
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [""];
}

function stableUuid(seed: string): string {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  const variant = Number.parseInt(chars[16]!, 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(
    16,
    20,
  )}-${value.slice(20)}`;
}

function chapterHeading(label: string | null, title: string, tag: "h1" | "h2"): string {
  const labelHtml = label ? `  <p class="chapter-label">${escapeXml(label)}</p>\n` : "";
  return `<header class="chapter-head">
${labelHtml}  <${tag} class="chapter-title">${escapeXml(title)}</${tag}>
</header>`;
}

function partPageHtml(label: string, title: string): string {
  return `<section class="part-page" epub:type="part">
  <p class="part-label">${escapeXml(label)}</p>
  <h1 class="part-title">${escapeXml(title)}</h1>
  <hr class="rule"/>
  <p class="ornament">\u2756</p>
</section>`;
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function formatNavTitle(title: string, index: number, language: string): string {
  if (!language.startsWith("bn")) return title;
  const match = /^(\s*)([0-9]+|[০-৯]+)([\s.)।:-]+)(.*)$/.exec(title);
  if (match) {
    const num = match[2]!;
    const rest = match[4]!;
    const bnNum = num.split("").map((d) => BN_DIGITS[Number(d)] ?? d).join("");
    return `${bnNum}. ${rest.trim()}`;
  }
  return `${toBengaliNumber(index)}. ${title.trim()}`;
}

/** Treat "none"/"null" placeholders from metadata sources as missing. */
function metaText(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return /^(none|null|undefined|n\/a)$/i.test(text) ? undefined : text;
}

function toNavInput(entry: NavEntry): { label: string; href: string; children: any[] } {
  return {
    label: entry.label,
    href: `${OEBPS}/${entry.href}`,
    children: entry.children.map(toNavInput),
  };
}

export function buildEpub(input: BookInput): BuildResult {
  const language = input.language ?? "bn";
  const labels = { ...labelsFor(language), ...(input.labels ?? {}) };
  const style: ThemeName = input.style ?? "classic";
  const modified = input.modified ?? isoNow();
  const identifier = input.identifier ?? `urn:uuid:${stableUuid(input.source ?? input.title)}`;
  const splitBytes = Math.max(0, (input.splitSizeKb ?? 200) * 1024);

  const pages: PageFile[] = [];
  const nav: NavEntry[] = [];
  const manifest: ManifestItem[] = [];
  const spine: SpineItem[] = [];

  const addManifest = (item: ManifestItem): ManifestItem => {
    manifest.push(item);
    return item;
  };
  const addPage = (file: PageFile): void => {
    pages.push(file);
    addManifest({ id: file.id, href: file.href, mediaType: "application/xhtml+xml", properties: [] });
  };

  // ---- Cover -------------------------------------------------------------
  if (input.cover) {
    const coverHref = `images/cover.${input.cover.ext}`;
    addManifest({
      id: "cover-image",
      href: coverHref,
      mediaType: input.cover.mediaType,
      properties: ["cover-image"],
    });
    addPage({
      id: "cover",
      href: "text/cover.xhtml",
      title: labels.cover,
      bodyClass: "cover-page",
      body: `  <section epub:type="cover">
    <img src="../${escapeAttr(coverHref)}" alt="${escapeAttr(labels.cover)}"/>
  </section>`,
      inSpine: true,
    });
  }

  // ---- Half title --------------------------------------------------------
  if (input.includeHalftitle === true) {
    addPage({
      id: "halftitle",
      href: "text/halftitle.xhtml",
      title: input.title,
      bodyClass: "halftitle-page",
      body: `  <section epub:type="frontmatter">
    <h1>${escapeXml(input.title)}</h1>
  </section>`,
      inSpine: true,
    });
  }

  // ---- Title page --------------------------------------------------------
  const authors = metaText((input.authors ?? []).join(", "));
  const authorLine = authors ? `  <p class="book-author">${escapeXml(authors)}</p>\n` : "";
  const publisher = metaText(input.publisher);
  const publisherLine = publisher
    ? `  <p class="book-publisher">${escapeXml(publisher)}</p>\n`
    : "";
  addPage({
    id: "titlepage",
    href: "text/titlepage.xhtml",
    title: labels.titlePage,
    bodyClass: "title-page",
    body: `  <section epub:type="titlepage">
    <h1 class="book-title">${escapeXml(input.title)}</h1>
${authorLine}${publisherLine}  </section>`,
    inSpine: true,
  });
  if (input.includeTitlePageInNav === true) {
    nav.push({ label: labels.titlePage, href: "text/titlepage.xhtml", children: [] });
  }

  // ---- Colophon ----------------------------------------------------------
  if (input.includeColophon === true) {
    const sourceLine = input.source
      ? `    <p>${escapeXml(labels.source)}: <a href="${escapeAttr(input.source)}">${escapeXml(
        input.source,
      )}</a></p>\n`
      : "";
    const collectedLine = input.date
      ? `    <p>${escapeXml(labels.collected)}: ${escapeXml(input.date)}</p>\n`
      : "";
    const extra = input.colophon
      ? input.colophon
        .split(/\n{2,}/)
        .map((para) => `    <p>${escapeXml(para.trim())}</p>`)
        .join("\n")
      : `    <p>${escapeXml(input.rights ?? labels.personal)}</p>`;
    addPage({
      id: "colophon",
      href: "text/colophon.xhtml",
      title: labels.source,
      bodyClass: "colophon-page",
      body: `  <section epub:type="colophon">
${sourceLine}${collectedLine}${extra}
  </section>`,
      inSpine: true,
    });
  }

  // ---- Extra Pages (Intro / Frontmatter) ----------------------------------
  const extraPageIds: string[] = [];
  if (input.extraPages && input.extraPages.length > 0) {
    input.extraPages.forEach((extra, index) => {
      const extraId = `intro-${String(index + 1).padStart(3, "0")}`;
      const extraHref = `text/${extraId}.xhtml`;
      extraPageIds.push(extraId);
      const cleanHtml = sanitizeHtml(fragmentOf(extra.html ?? ""), { title: extra.title });
      addPage({
        id: extraId,
        href: extraHref,
        title: extra.title || labels.contents,
        bodyClass: "frontmatter-page",
        body: `  <section class="frontmatter-page" epub:type="frontmatter">
    <div class="body-text">
${cleanHtml}
    </div>
  </section>`,
        inSpine: true,
      });
    });
  }

  // ---- Body --------------------------------------------------------------
  let chapterNo = 0;
  let partNo = 0;

  const emitChapter = (
    item: ChapterInput,
    options: { navParent: NavEntry[]; heading: boolean; label?: string },
  ): void => {
    const rawHtml = fragmentOf(item.html ?? "");
    const clean = sanitizeHtml(rawHtml, { title: item.title });
    const chunks = splitFragment(clean, splitBytes);
    const baseId = `ch-${String(++chapterNo).padStart(3, "0")}`;
    let firstHref = "";

    chunks.forEach((chunk, index) => {
      const href = `text/${baseId}${index === 0 ? "" : `-${index + 1}`}.xhtml`;
      if (index === 0) firstHref = href;
      const headingHtml =
        index === 0 && options.heading
          ? `<header class="chapter-head">\n  <h2 class="chapter-title">${escapeXml(item.title)}</h2>\n</header>\n`
          : "";
      const body = `  <section class="chapter${index > 0 ? " continued" : ""}" epub:type="chapter">
${headingHtml}  <div class="body-text">
${chunk}
  </div>
  </section>`;
      addPage({
        id: `${baseId}${index === 0 ? "" : `-${index + 1}`}`,
        href,
        title: item.title,
        bodyClass: "chapter-page",
        body,
        inSpine: true,
      });
    });

    const navLabel =
      input.numberToc !== false && language.startsWith("bn")
        ? formatNavTitle(item.title, chapterNo, language)
        : item.title;
    options.navParent.push({ label: navLabel, href: firstHref, children: [] });
  };

  for (const part of input.parts as PartInput[]) {
    const hasPartTitle = Boolean(part.title && part.title.trim());
    let partNav: NavEntry[] = nav;

    if (hasPartTitle) {
      partNo += 1;
      const label = part.label ?? `${labels.part} ${toLocalNumber(partNo, language)}`;
      const id = `part-${String(partNo).padStart(3, "0")}`;
      addPage({
        id,
        href: `text/${id}.xhtml`,
        title: part.title!,
        bodyClass: "part-page",
        body: partPageHtml(label, part.title!),
        inSpine: true,
      });
      const entry: NavEntry = { label: part.title!, href: `text/${id}.xhtml`, children: [] };
      nav.push(entry);
      partNav = entry.children;
    }

    const lessons = part.lessons;
    const singleSameTitle =
      hasPartTitle && lessons.length === 1 && lessons[0]!.title.trim() === part.title!.trim();

    if (singleSameTitle) {
      // The part page already carries the title; emit the content without a heading.
      const lesson = lessons[0]!;
      const rawHtml = fragmentOf(lesson.html ?? "");
      const clean = sanitizeHtml(rawHtml, { title: lesson.title });
      if (clean) {
        const chunks = splitFragment(clean, splitBytes);
        const baseId = `ch-${String(++chapterNo).padStart(3, "0")}`;
        chunks.forEach((chunk, index) => {
          const id = `${baseId}${index === 0 ? "" : `-${index + 1}`}`;
          addPage({
            id,
            href: `text/${id}.xhtml`,
            title: lesson.title,
            bodyClass: "chapter-page",
            body: `  <section class="chapter${index > 0 ? " continued" : ""}" epub:type="chapter">
  <div class="body-text">
${chunk}
  </div>
  </section>`,
            inSpine: true,
          });
        });
      }
      // Topics (if any) hang off the part entry.
      for (const topic of lesson.topics ?? []) {
        emitTopic(topic, partNav);
      }
      continue;
    }

    for (const lesson of lessons) {
      const topics = lesson.topics ?? [];
      const clean = sanitizeHtml(fragmentOf(lesson.html ?? ""), { title: lesson.title });

      if (lesson.titlePage || (!clean && topics.length > 0)) {
        const id = `title-${String(pages.length + 1).padStart(3, "0")}`;
        addPage({
          id,
          href: `text/${id}.xhtml`,
          title: lesson.title,
          bodyClass: "part-page",
          body: partPageHtml(labels.chapter, lesson.title),
          inSpine: true,
        });
        const entry: NavEntry = { label: lesson.title, href: `text/${id}.xhtml`, children: [] };
        partNav.push(entry);
        for (const topic of topics) emitTopic(topic, entry.children);
        continue;
      }

      if (!clean && topics.length === 0) {
        continue;
      }

      emitChapter(lesson, {
        navParent: partNav,
        heading: true,
        label: undefined,
      });
      const entry = partNav[partNav.length - 1]!;
      for (const topic of topics) emitTopic(topic, entry.children);
    }
  }

  function emitTopic(topic: ChapterInput, parent: NavEntry[]): void {
    const clean = sanitizeHtml(fragmentOf(topic.html ?? ""), { title: topic.title });
    const id = `topic-${String(pages.length + 1).padStart(3, "0")}`;
    addPage({
      id,
      href: `text/${id}.xhtml`,
      title: topic.title,
      bodyClass: "topic-page",
      body: `  <section class="topic" epub:type="chapter">
    <header class="topic-head">
      <h2 class="topic-title">${escapeXml(topic.title)}</h2>
    </header>
    <div class="body-text">
${clean}
    </div>
  </section>`,
      inSpine: true,
    });
    parent.push({ label: topic.title, href: `text/${id}.xhtml`, children: [] });
  }

  // ---- Contents / nav document ------------------------------------------
  const navInput = nav.map(toNavInput);
  const navHtml = buildNavDocument(navInput, {
    navPath: `${OEBPS}/nav.xhtml`,
    cssHref: "css/style.css",
    title: labels.contents,
    language,
  });
  addManifest({
    id: "nav",
    href: "nav.xhtml",
    mediaType: "application/xhtml+xml",
    properties: ["nav"],
  });

  // ---- CSS, font, cover bytes -------------------------------------------
  addManifest({ id: "css", href: "css/style.css", mediaType: "text/css", properties: [] });
  const fonts = input.fonts ?? (input.font ? [input.font] : []);
  const fontFiles = new Map<string, (typeof fonts)[number]>();
  for (const font of fonts) fontFiles.set(font.filename, font);
  let fontNo = 0;
  for (const font of fontFiles.values()) {
    addManifest({
      id: `font-${++fontNo}`,
      href: `fonts/${font.filename}`,
      mediaType: fontMediaType(font.filename),
      properties: [],
    });
  }

  // ---- Content images ----------------------------------------------------
  const images = new Map<string, { mediaType: string; data: Uint8Array }>();
  for (const image of input.images ?? []) {
    if (!images.has(image.href)) images.set(image.href, { mediaType: image.mediaType, data: image.data });
  }
  let imageNo = 0;
  for (const href of images.keys()) {
    addManifest({ id: `img-${++imageNo}`, href, mediaType: images.get(href)!.mediaType, properties: [] });
  }

  // ---- NCX ---------------------------------------------------------------
  const ncx = buildNcxDocument(navInput, {
    ncxPath: `${OEBPS}/toc.ncx`,
    bookTitle: input.title,
    identifier,
  });
  addManifest({ id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml", properties: [] });

  // ---- End page ------------------------------------------------
  if (input.includeEnd !== false) {
    const somaptoText = labels.end ?? (language.startsWith("bn") ? "সমাপ্ত" : "The End");
    addPage({
      id: "somapto",
      href: "text/somapto.xhtml",
      title: somaptoText,
      bodyClass: "somapto-page",
      body: `  <section class="somapto-section" epub:type="backmatter">
    <p class="somapto-text"><strong>${escapeXml(somaptoText)}</strong></p>
  </section>`,
      inSpine: true,
    });
  }

  // ---- Spine -------------------------------------------------------------
  const frontMatter = new Set(["cover", "halftitle", "titlepage", "colophon", ...extraPageIds]);
  const frontPages = pages.filter((item) => item.inSpine && frontMatter.has(item.id));
  const bodyPages = pages.filter((item) => item.inSpine && !frontMatter.has(item.id));
  spine.push(
    ...frontPages.map((item) => ({ idref: item.id, linear: true, properties: [] })),
    { idref: "nav", linear: true, properties: [] },
    ...bodyPages.map((item) => ({ idref: item.id, linear: true, properties: [] })),
  );

  // ---- OPF ---------------------------------------------------------------
  const opf: OpfPackage = {
    version: "3.0",
    uniqueIdentifier: "bookid",
    tocId: "ncx",
    metadata: {
      title: input.title,
      creators: (input.authors ?? []).map((name) => ({ name })),
      language,
      identifier,
      publisher: input.publisher,
      date: input.date,
      description: input.description,
      subjects: input.subjects ?? [],
      rights: input.rights,
      source: input.source,
      series: input.series,
      seriesIndex: input.seriesIndex,
      modified,
      coverId: input.cover ? "cover-image" : undefined,
    },
    manifest,
    spine,
  };

  // ---- Assemble ----------------------------------------------------------
  const files: ZipEntry[] = [
    { name: "mimetype", data: new TextEncoder().encode("application/epub+zip"), store: true },
    {
      name: "META-INF/container.xml",
      data: new TextEncoder().encode(containerXml()),
    },
    { name: "OEBPS/content.opf", data: new TextEncoder().encode(buildOpf(opf, modified)) },
    { name: "OEBPS/nav.xhtml", data: new TextEncoder().encode(navHtml) },
    { name: "OEBPS/toc.ncx", data: new TextEncoder().encode(ncx) },
    {
      name: "OEBPS/css/style.css",
      data: new TextEncoder().encode(themeCss(style, { language, fonts })),
    },
  ];

  for (const font of fontFiles.values()) {
    files.push({ name: `OEBPS/fonts/${font.filename}`, data: font.data });
  }
  for (const [href, image] of images) {
    files.push({ name: `OEBPS/${href}`, data: image.data });
  }
  if (input.cover) {
    files.push({ name: `OEBPS/images/cover.${input.cover.ext}`, data: input.cover.data });
  }

  for (const item of pages) {
    files.push({
      name: `OEBPS/${item.href}`,
      data: new TextEncoder().encode(
        page(item.bodyClass, item.body, language, item.title, "../css/style.css"),
      ),
    });
  }

  const data = writeZip(files, new Date(modified));
  return { data, files: files.map((entry) => entry.name), identifier };
}

function fontMediaType(filename: string): string {
  if (filename.endsWith(".woff2")) return "font/woff2";
  if (filename.endsWith(".woff")) return "font/woff";
  if (filename.endsWith(".otf")) return "font/otf";
  return "font/ttf";
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}
