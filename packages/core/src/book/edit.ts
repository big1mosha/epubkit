import * as cheerio from "cheerio";
import { buildOpf, type ManifestItem, type OpfMetadata, type OpfPackage, type SpineItem } from "../archive/opf.ts";
import { assertSafePath, dirname, relativeHref, resolveHref } from "../util/path.ts";
import { isoNow } from "../util/text.ts";
import { labelsFor } from "./types.ts";
import { sanitizeHtml } from "../html/sanitize.ts";
import { xhtmlDocument } from "../html/xhtml.ts";
import { Epub, type TocEntry } from "./reader.ts";
import { buildNavDocument, buildNcxDocument, type NavEntryInput } from "./nav-build.ts";
import { coverFromBytes, type CoverAsset } from "../cover/generate.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function enc(value: string): Uint8Array {
  return encoder.encode(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isFullDocument(html: string): boolean {
  return /^\s*(<\?xml|<!DOCTYPE|<html[\s>])/i.test(html);
}

function uniqueId(opf: OpfPackage, base: string): string {
  const ids = new Set(opf.manifest.map((item) => item.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function uniquePath(epub: Epub, dir: string, base: string, ext = "xhtml"): string {
  const prefix = dir ? `${dir}/` : "";
  let candidate = `${prefix}${base}.${ext}`;
  let index = 2;
  while (epub.entries.has(candidate)) {
    candidate = `${prefix}${base}-${index}.${ext}`;
    index++;
  }
  return candidate;
}

export function findSpineIndex(epub: Epub, at: string): number {
  const spine = epub.spineItems();
  const ref = at.trim();

  if (/^#\d+$/.test(ref)) {
    const index = Number(ref.slice(1)) - 1;
    if (index < 0 || index >= spine.length) {
      throw new Error(`Spine index out of range: ${ref} (1-${spine.length})`);
    }
    return index;
  }

  const wanted = ref.replace(/^\.\//, "");
  for (let index = 0; index < spine.length; index++) {
    const entry = spine[index]!;
    if (
      entry.path === wanted ||
      entry.item.href === wanted ||
      entry.item.href === ref ||
      entry.path.split("/").pop() === wanted.split("/").pop()
    ) {
      return index;
    }
  }
  throw new Error(`Page not found in spine: ${at}`);
}

function wrapFragment(
  epub: Epub,
  likePath: string,
  fragment: string,
  title: string,
): string {
  const target = epub.readText(likePath);
  const $ = cheerio.load(target, { xmlMode: true });
  const language =
    $("html").attr("xml:lang") ?? $("html").attr("lang") ?? epub.opf.metadata.language;
  const links = $("head link[rel='stylesheet']").toArray();
  const first = links[0] ? $(links[0]).attr("href") : undefined;
  const extra = links
    .slice(1)
    .map((link) => `  ${$.html(link)}`)
    .join("\n");
  const bodyClass = $("body").attr("class");
  const clean = sanitizeHtml(fragment);

  return xhtmlDocument({
    language,
    title,
    cssHref: first,
    bodyClass,
    body: `  <div class="body-text">\n${clean}\n  </div>`,
    extraHead: extra,
  });
}

function cssPath(epub: Epub): string | undefined {
  const item = epub.opf.manifest.find((entry) => entry.mediaType === "text/css");
  return item ? epub.itemPath(item) : undefined;
}

export function ensureNav(epub: Epub): string {
  const existing = epub.navItem();
  if (existing) return epub.itemPath(existing);
  const path = resolveHref(epub.rootDir, "nav.xhtml");
  epub.opf.manifest.push({
    id: uniqueId(epub.opf, "nav"),
    href: relativeHref(epub.opfPath, path),
    mediaType: "application/xhtml+xml",
    properties: ["nav"],
  });
  return path;
}

export function ensureNcx(epub: Epub): string {
  const existing = epub.ncxItem();
  if (existing) return epub.itemPath(existing);
  const path = resolveHref(epub.rootDir, "toc.ncx");
  const id = uniqueId(epub.opf, "ncx");
  epub.opf.manifest.push({
    id,
    href: relativeHref(epub.opfPath, path),
    mediaType: "application/x-dtbncx+xml",
    properties: [],
  });
  epub.opf.tocId = id;
  return path;
}

export function writeToc(epub: Epub, toc: TocEntry[]): void {
  const navPath = ensureNav(epub);
  const ncxPath = ensureNcx(epub);
  const css = cssPath(epub);
  const language = epub.opf.metadata.language;
  const entries = toc as unknown as NavEntryInput[];

  epub.setEntry(
    navPath,
    buildNavDocument(entries, {
      navPath,
      cssHref: css ? relativeHref(navPath, css) : undefined,
      title: labelsFor(language).contents,
      language,
    }),
  );
  epub.setEntry(
    ncxPath,
    buildNcxDocument(entries, {
      ncxPath,
      bookTitle: epub.title,
      identifier: epub.opf.metadata.identifier,
    }),
  );
}

function updateTocLabel(entries: TocEntry[], path: string, label: string): boolean {
  for (const entry of entries) {
    if (entry.href === path) {
      entry.label = label;
      return true;
    }
    if (updateTocLabel(entry.children, path, label)) return true;
  }
  return false;
}

function insertTocAfter(entries: TocEntry[], path: string, entry: TocEntry): boolean {
  for (let index = 0; index < entries.length; index++) {
    const current = entries[index]!;
    if (current.href === path) {
      entries.splice(index + 1, 0, entry);
      return true;
    }
    if (insertTocAfter(current.children, path, entry)) return true;
  }
  return false;
}

function removeToc(entries: TocEntry[], path: string): TocEntry[] {
  return entries
    .filter((entry) => entry.href !== path)
    .map((entry) => ({ ...entry, children: removeToc(entry.children, path) }));
}

export function finalizeEpub(epub: Epub): Uint8Array {
  epub.setEntry(epub.opfPath, buildOpf(epub.opf, isoNow()));
  return epub.toBytes();
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeOptions {
  title?: string;
  authors?: string[];
  language?: string;
  cover?: CoverAsset;
  flat?: boolean;
  unifyCss?: Uint8Array | string;
  identifier?: string;
}

function mapToc(entries: TocEntry[], map: (entry: TocEntry) => string): NavEntryInput[] {
  return entries.map((entry) => ({
    label: entry.label,
    href: map(entry),
    fragment: entry.fragment,
    children: mapToc(entry.children, map),
  }));
}

export function mergeEpubs(books: Epub[], options: MergeOptions = {}): Uint8Array {
  if (books.length === 0) throw new Error("Nothing to merge");
  for (const book of books) {
    if (book.hasDrm()) {
      throw new Error(`DRM-protected EPUB is not supported: ${book.title}`);
    }
  }

  const opfPath = "OEBPS/content.opf";
  const rootDir = "OEBPS";
  const entries = new Map<string, Uint8Array>();
  entries.set("mimetype", enc("application/epub+zip"));

  const manifest: ManifestItem[] = [];
  const spine: SpineItem[] = [];
  const navEntries: NavEntryInput[] = [];
  const ids = new Set<string>();

  const addId = (base: string): string => {
    let id = base;
    let index = 2;
    while (ids.has(id)) id = `${base}-${index++}`;
    ids.add(id);
    return id;
  };

  let coverItem: ManifestItem | undefined;

  books.forEach((book, bookIndex) => {
    const prefix = `b${bookIndex + 1}`;
    const nav = book.navItem();
    const ncx = book.ncxItem();
    const skip = new Set<string>([book.opfPath]);
    if (nav) skip.add(book.itemPath(nav));
    if (ncx) skip.add(book.itemPath(ncx));

    for (const [name, data] of book.entries) {
      if (name === "mimetype") continue;
      if (name.startsWith("META-INF/")) continue;
      if (skip.has(name)) continue;
      assertSafePath(name);
      entries.set(`${prefix}/${name}`, data);
    }

    const idMap = new Map<string, string>();
    for (const item of book.opf.manifest) {
      if (nav && item.id === nav.id) continue;
      if (ncx && item.id === ncx.id) continue;
      const itemPath = book.itemPath(item);
      if (skip.has(itemPath)) continue;
      if (!entries.has(`${prefix}/${itemPath}`)) continue;

      const id = addId(`${prefix}_${item.id}`);
      idMap.set(item.id, id);
      const properties = item.properties.filter(
        (property) => property !== "nav" && property !== "cover-image",
      );
      const next: ManifestItem = {
        id,
        href: relativeHref(opfPath, `${prefix}/${itemPath}`),
        mediaType: item.mediaType,
        properties,
      };
      manifest.push(next);
      if (!coverItem && item.properties.includes("cover-image")) coverItem = next;
    }

    for (const ref of book.opf.spine) {
      const id = idMap.get(ref.idref);
      if (!id) continue;
      spine.push({ idref: id, linear: ref.linear, properties: [] });
    }

    const toc = mapToc(book.toc(), (entry) => `${prefix}/${entry.href}`);
    const firstSpine = book.spineItems()[0];
    const fallback = firstSpine ? `${prefix}/${firstSpine.path}` : "";

    if (options.flat) {
      if (toc.length > 0) navEntries.push(...toc);
      else if (fallback) navEntries.push({ label: book.title, href: fallback, children: [] });
    } else {
      navEntries.push({
        label: book.title,
        href: toc[0]?.href ?? fallback,
        children: toc,
      });
    }
  });

  if (options.cover) {
    const href = `images/cover.${options.cover.ext}`;
    entries.set(`${rootDir}/${href}`, options.cover.data);
    coverItem = {
      id: addId("cover-image"),
      href,
      mediaType: options.cover.mediaType,
      properties: ["cover-image"],
    };
    manifest.push(coverItem);
  } else if (coverItem) {
    coverItem.properties.push("cover-image");
  }

  let unifiedCssHref: string | undefined;
  if (options.unifyCss) {
    const href = "css/epubkit.css";
    entries.set(`${rootDir}/${href}`, typeof options.unifyCss === "string" ? enc(options.unifyCss) : options.unifyCss);
    manifest.push({
      id: addId("epubkit-css"),
      href,
      mediaType: "text/css",
      properties: [],
    });
    unifiedCssHref = `${rootDir}/${href}`;

    for (const [name, data] of [...entries]) {
      if (!/\.x?html$/i.test(name)) continue;
      const text = decoder.decode(data);
      if (!/<\/head>/i.test(text)) continue;
      const relative = relativeHref(name, unifiedCssHref);
      const link = `  <link rel="stylesheet" type="text/css" href="${relative}"/>`;
      entries.set(name, enc(text.replace(/<\/head>/i, `${link}\n</head>`)));
    }
  }

  const language = options.language ?? books[0]!.opf.metadata.language;
  const authors =
    options.authors ??
    [...new Set(books.flatMap((book) => book.opf.metadata.creators.map((creator) => creator.name)))];

  const navPath = `${rootDir}/nav.xhtml`;
  const ncxPath = `${rootDir}/toc.ncx`;
  manifest.push({
    id: addId("nav"),
    href: "nav.xhtml",
    mediaType: "application/xhtml+xml",
    properties: ["nav"],
  });
  const ncxId = addId("ncx");
  manifest.push({
    id: ncxId,
    href: "toc.ncx",
    mediaType: "application/x-dtbncx+xml",
    properties: [],
  });

  entries.set(
    navPath,
    enc(
      buildNavDocument(navEntries, {
        navPath,
        cssHref: unifiedCssHref ? relativeHref(navPath, unifiedCssHref) : undefined,
        title: labelsFor(language).contents,
        language,
      }),
    ),
  );

  const identifier = options.identifier ?? `urn:uuid:${crypto.randomUUID()}`;
  entries.set(
    ncxPath,
    enc(
      buildNcxDocument(navEntries, {
        ncxPath,
        bookTitle: options.title ?? books[0]!.title,
        identifier,
      }),
    ),
  );

  const opf: OpfPackage = {
    version: "3.0",
    uniqueIdentifier: "bookid",
    tocId: ncxId,
    metadata: {
      title: options.title ?? books[0]!.title,
      creators: authors.map((name) => ({ name })),
      language,
      identifier,
      subjects: [...new Set(books.flatMap((book) => book.opf.metadata.subjects))],
      modified: isoNow(),
      coverId: coverItem?.id,
    },
    manifest,
    spine,
  };

  entries.set("META-INF/container.xml", enc(containerXml(opfPath)));
  entries.set(opfPath, enc(buildOpf(opf, isoNow())));
  return Epub.create(entries, opfPath, opf).toBytes();
}

function containerXml(opfPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

export interface ReplacePageOptions {
  at: string;
  html: string;
  title?: string;
}

export function replacePage(epub: Epub, options: ReplacePageOptions): { path: string } {
  const index = findSpineIndex(epub, options.at);
  const target = epub.spineItems()[index]!;
  const content = isFullDocument(options.html)
    ? options.html
    : wrapFragment(epub, target.path, options.html, options.title ?? epub.title);

  epub.setEntry(target.path, content);

  if (options.title) {
    const toc = epub.toc();
    if (updateTocLabel(toc, target.path, options.title)) writeToc(epub, toc);
  }
  return { path: target.path };
}

export interface AddPageOptions {
  after: string;
  html: string;
  title?: string;
}

export function addPage(epub: Epub, options: AddPageOptions): { path: string } {
  const index = findSpineIndex(epub, options.after);
  const target = epub.spineItems()[index]!;
  const dir = dirname(target.path);
  const path = uniquePath(epub, dir, "page");
  const id = uniqueId(epub.opf, "page");
  const label = options.title ?? "Page";

  epub.setEntry(
    path,
    isFullDocument(options.html) ? options.html : wrapFragment(epub, target.path, options.html, label),
  );
  epub.opf.manifest.push({
    id,
    href: relativeHref(epub.opfPath, path),
    mediaType: "application/xhtml+xml",
    properties: [],
  });
  epub.opf.spine.splice(index + 1, 0, { idref: id, linear: true, properties: [] });

  const toc = epub.toc();
  if (!insertTocAfter(toc, target.path, { label, href: path, children: [] })) {
    toc.push({ label, href: path, children: [] });
  }
  writeToc(epub, toc);
  return { path };
}

export interface RemovePageOptions {
  at: string;
}

export function removePage(epub: Epub, options: RemovePageOptions): { path: string } {
  const index = findSpineIndex(epub, options.at);
  const target = epub.spineItems()[index]!;
  if (epub.spineItems().length <= 1) throw new Error("Cannot remove the last spine item");

  epub.opf.spine = epub.opf.spine.filter((ref) => ref.idref !== target.item.id);
  epub.opf.manifest = epub.opf.manifest.filter((item) => item.id !== target.item.id);
  epub.deleteEntry(target.path);

  const toc = removeToc(epub.toc(), target.path);
  writeToc(epub, toc);
  return { path: target.path };
}

// ---------------------------------------------------------------------------
// Image operations
// ---------------------------------------------------------------------------

export interface ReplaceImageOptions {
  at: string;
  data: Uint8Array;
  mediaType?: string;
}

export function findImage(epub: Epub, at: string): { path: string; item: ManifestItem } {
  const images = epub.imageItems();
  const ref = at.trim();
  if (/^#\d+$/.test(ref)) {
    const index = Number(ref.slice(1)) - 1;
    if (index < 0 || index >= images.length) {
      throw new Error(`Image index out of range: ${ref} (1-${images.length})`);
    }
    const found = images[index]!;
    return { path: found.path, item: found.item };
  }

  const wanted = ref.replace(/^\.\//, "");
  for (const image of images) {
    if (
      image.path === wanted ||
      image.item.href === wanted ||
      image.path.endsWith(`/${wanted}`) ||
      image.path.split("/").pop() === wanted.split("/").pop()
    ) {
      return { path: image.path, item: image.item };
    }
  }
  throw new Error(`Image not found: ${at}`);
}

function rewriteImageReferences(epub: Epub, oldPath: string, newPath: string): void {
  const oldBase = oldPath.split("/").pop()!;
  const newBase = newPath.split("/").pop()!;
  for (const [name, data] of [...epub.entries]) {
    if (!/\.(x?html|css|svg|ncx|opf)$/i.test(name)) continue;
    const text = decoder.decode(data);
    if (!text.includes(oldBase)) continue;
    const relativeOld = relativeHref(name, oldPath);
    const relativeNew = relativeHref(name, newPath);
    let next = text
      .split(relativeOld)
      .join(relativeNew)
      .split(encodeURI(relativeOld))
      .join(encodeURI(relativeNew));
    if (!next.includes(newBase)) {
      next = next.replace(new RegExp(escapeRegExp(oldBase), "g"), newBase);
    }
    if (next !== text) epub.setEntry(name, next);
  }
}

export function replaceImage(epub: Epub, options: ReplaceImageOptions): { path: string } {
  const { path, item } = findImage(epub, options.at);
  const sniffed = coverFromBytes(options.data);
  const mediaType = options.mediaType ?? sniffed?.mediaType ?? item.mediaType;
  const ext = sniffed?.ext ?? path.split(".").pop() ?? "jpg";
  const nextPath = path.replace(/\.[^.]+$/, `.${ext}`);

  if (nextPath !== path) {
    rewriteImageReferences(epub, path, nextPath);
    epub.renameEntry(path, nextPath);
    item.href = relativeHref(epub.opfPath, nextPath);
  }
  item.mediaType = mediaType;
  epub.setEntry(nextPath, options.data);
  return { path: nextPath };
}

// ---------------------------------------------------------------------------
// Metadata / TOC
// ---------------------------------------------------------------------------

export function updateMetadata(epub: Epub, changes: Partial<OpfMetadata>): void {
  Object.assign(epub.opf.metadata, changes);
  epub.opf.metadata.modified = isoNow();
}

export function setTocLabel(epub: Epub, href: string, label: string): boolean {
  const toc = epub.toc();
  const changed = updateTocLabel(toc, href, label);
  if (changed) writeToc(epub, toc);
  return changed;
}

export function coverOf(epub: Epub): CoverAsset | null {
  const path = epub.coverPath();
  if (!path) return null;
  const data = epub.entries.get(path);
  if (!data) return null;
  return coverFromBytes(data);
}

export function setCover(epub: Epub, cover: CoverAsset): string {
  const path = resolveHref(epub.rootDir, `images/cover.${cover.ext}`);
  const previous = epub.coverPath();
  let item = epub.coverItem();

  if (item) {
    item.mediaType = cover.mediaType;
    item.href = relativeHref(epub.opfPath, path);
    item.properties = [...new Set([...item.properties, "cover-image"])];
  } else {
    item = {
      id: uniqueId(epub.opf, "cover-image"),
      href: relativeHref(epub.opfPath, path),
      mediaType: cover.mediaType,
      properties: ["cover-image"],
    };
    epub.opf.manifest.push(item);
  }

  epub.setEntry(path, cover.data);
  if (previous && previous !== path) epub.deleteEntry(previous);
  epub.opf.metadata.coverId = item.id;
  return path;
}

export function resolveTocHref(epub: Epub, wanted: string): string | undefined {
  const ref = wanted.replace(/^\.\//, "");
  const found: string[] = [];
  const walk = (entries: TocEntry[]): void => {
    for (const entry of entries) {
      if (
        entry.href === ref ||
        entry.href.endsWith(`/${ref}`) ||
        entry.href.split("/").pop() === ref.split("/").pop()
      ) {
        found.push(entry.href);
      }
      walk(entry.children);
    }
  };
  walk(epub.toc());
  return found[0];
}

