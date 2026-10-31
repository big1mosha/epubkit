import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { readFile } from "node:fs/promises";
import { parseOpf, type ManifestItem, type OpfPackage } from "../archive/opf.ts";
import { readZip, writeZip, type ZipEntry } from "../archive/zip.ts";
import { asArray, nodeText, parseXml, tryParseXml } from "../archive/xml.ts";
import { dirname, normalizeHref, resolveHref } from "../util/path.ts";
import { collapseWhitespace } from "../util/text.ts";

export interface TocEntry {
  label: string;
  /** Archive path of the target document, without fragment. */
  href: string;
  fragment?: string;
  children: TocEntry[];
}

export interface SpineEntry {
  item: ManifestItem;
  /** Archive path of the document. */
  path: string;
}

export interface ImageEntry {
  item: ManifestItem;
  path: string;
  data: Uint8Array;
  size: number;
}

export interface OpenOptions {
  /** Do not fail on missing mimetype (used for broken archives). */
  lenient?: boolean;
}

export class Epub {
  readonly entries: Map<string, Uint8Array>;
  readonly opfPath: string;
  readonly rootDir: string;
  readonly opf: OpfPackage;

  private constructor(entries: Map<string, Uint8Array>, opfPath: string, opf: OpfPackage) {
    this.entries = entries;
    this.opfPath = opfPath;
    this.rootDir = dirname(opfPath);
    this.opf = opf;
  }

  /** Build an in-memory EPUB from an already-parsed package. */
  static create(entries: Map<string, Uint8Array>, opfPath: string, opf: OpfPackage): Epub {
    return new Epub(entries, opfPath, opf);
  }

  static async open(input: string | Uint8Array, options: OpenOptions = {}): Promise<Epub> {
    const data = typeof input === "string" ? new Uint8Array(await readFile(input)) : input;
    return Epub.fromBytes(data, options);
  }

  static fromBytes(data: Uint8Array, options: OpenOptions = {}): Epub {
    const entries = readZip(data);

    if (!options.lenient) {
      const mimetype = entries.get("mimetype");
      if (!mimetype) throw new Error("Not an EPUB: missing mimetype entry");
      const text = new TextDecoder().decode(mimetype).trim();
      if (text !== "application/epub+zip") {
        throw new Error(`Not an EPUB: unexpected mimetype "${text}"`);
      }
    }

    const containerBytes = entries.get("META-INF/container.xml");
    if (!containerBytes) throw new Error("Not an EPUB: missing META-INF/container.xml");
    const container = parseXml<{
      container?: { rootfiles?: { rootfile?: unknown } };
    }>(new TextDecoder().decode(containerBytes));
    const rootfile = asArray(
      (container.container?.rootfiles as Record<string, unknown> | undefined)?.rootfile as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    )[0] as Record<string, unknown> | undefined;
    const opfPath = rootfile?.["@_full-path"] ? String(rootfile["@_full-path"]) : undefined;
    if (!opfPath) throw new Error("Not an EPUB: container.xml has no rootfile");
    if (!entries.has(opfPath)) throw new Error(`Not an EPUB: missing package document ${opfPath}`);

    const opf = parseOpf(new TextDecoder().decode(entries.get(opfPath)));
    return new Epub(entries, opfPath, opf);
  }

  get title(): string {
    return this.opf.metadata.title;
  }

  get language(): string {
    return this.opf.metadata.language;
  }

  readText(path: string): string {
    const data = this.entries.get(path);
    if (!data) throw new Error(`Missing file in EPUB: ${path}`);
    return new TextDecoder().decode(data);
  }

  readBytes(path: string): Uint8Array {
    const data = this.entries.get(path);
    if (!data) throw new Error(`Missing file in EPUB: ${path}`);
    return data;
  }

  /** Archive path for a manifest item. */
  itemPath(item: ManifestItem): string {
    return resolveHref(this.rootDir, item.href);
  }

  itemById(id: string): ManifestItem | undefined {
    return this.opf.manifest.find((item) => item.id === id);
  }

  itemByPath(path: string): ManifestItem | undefined {
    const normalized = normalizeHref(path);
    return this.opf.manifest.find((item) => normalizeHref(this.itemPath(item)) === normalized);
  }

  spineItems(): SpineEntry[] {
    const out: SpineEntry[] = [];
    for (const ref of this.opf.spine) {
      const item = this.itemById(ref.idref);
      if (!item) continue;
      out.push({ item, path: this.itemPath(item) });
    }
    return out;
  }

  imageItems(): ImageEntry[] {
    return this.opf.manifest
      .filter((item) => item.mediaType.startsWith("image/"))
      .map((item) => {
        const path = this.itemPath(item);
        const data = this.entries.get(path) ?? new Uint8Array();
        return { item, path, data, size: data.byteLength };
      });
  }

  navItem(): ManifestItem | undefined {
    return this.opf.manifest.find((item) => item.properties.includes("nav"));
  }

  ncxItem(): ManifestItem | undefined {
    if (this.opf.tocId) {
      const byId = this.itemById(this.opf.tocId);
      if (byId) return byId;
    }
    return this.opf.manifest.find((item) => item.mediaType === "application/x-dtbncx+xml");
  }

  coverItem(): ManifestItem | undefined {
    const byProperty = this.opf.manifest.find((item) => item.properties.includes("cover-image"));
    if (byProperty) return byProperty;
    if (this.opf.metadata.coverId) {
      const byMeta = this.itemById(this.opf.metadata.coverId);
      if (byMeta) return byMeta;
    }
    return this.opf.manifest.find(
      (item) =>
        item.mediaType.startsWith("image/") && /(^|\/)cover[^/]*\.(jpe?g|png|gif|webp|svg)$/i.test(item.href),
    );
  }

  coverPath(): string | undefined {
    const item = this.coverItem();
    return item ? this.itemPath(item) : undefined;
  }

  toc(): TocEntry[] {
    const nav = this.navItem();
    if (nav) {
      const parsed = parseNavToc(this.readText(this.itemPath(nav)), this.itemPath(nav), this.rootDir);
      if (parsed.length > 0) return parsed;
    }
    const ncx = this.ncxItem();
    if (ncx) {
      return parseNcxToc(this.readText(this.itemPath(ncx)), this.itemPath(ncx), this.rootDir);
    }
    return [];
  }

  hasEncryption(): boolean {
    return this.entries.has("META-INF/encryption.xml");
  }

  hasDrm(): boolean {
    if (this.entries.has("META-INF/rights.xml")) return true;
    if (this.entries.has("META-INF/sinf.xml")) return true;
    const encryption = this.entries.get("META-INF/encryption.xml");
    if (!encryption) return false;
    const text = new TextDecoder().decode(encryption);
    // Font obfuscation is not DRM; rights-based algorithms are.
    return /rights\.xml|aes256-cbc|aes128-cbc/i.test(text);
  }

  wordCount(): number {
    let count = 0;
    for (const entry of this.spineItems()) {
      if (entry.item.mediaType !== "application/xhtml+xml" && entry.item.mediaType !== "text/html") {
        continue;
      }
      const $ = cheerio.load(this.readText(entry.path));
      $("script, style").remove();
      const text = collapseWhitespace($("body").text() || $.root().text());
      if (text) count += text.split(/\s+/).length;
    }
    return count;
  }

  /** Rebuild the archive from the current entries. */
  toBytes(modified: Date = new Date()): Uint8Array {
    const files: ZipEntry[] = [];
    const seen = new Set<string>();

    const add = (name: string, data: Uint8Array, store = false): void => {
      if (seen.has(name)) return;
      seen.add(name);
      files.push({ name, data, store });
    };

    const mimetype = this.entries.get("mimetype");
    add("mimetype", mimetype ?? new TextEncoder().encode("application/epub+zip"), true);
    const container = this.entries.get("META-INF/container.xml");
    if (container) add("META-INF/container.xml", container);

    for (const [name, data] of this.entries) {
      if (name === "mimetype" || name === "META-INF/container.xml") continue;
      add(name, data);
    }
    return writeZip(files, modified);
  }

  /** Write an entry, creating no directories (EPUBs store flat names). */
  setEntry(path: string, data: Uint8Array | string): void {
    this.entries.set(
      path,
      typeof data === "string" ? new TextEncoder().encode(data) : data,
    );
  }

  deleteEntry(path: string): void {
    this.entries.delete(path);
  }

  renameEntry(from: string, to: string): void {
    const data = this.entries.get(from);
    if (!data) throw new Error(`Missing file in EPUB: ${from}`);
    this.entries.delete(from);
    this.entries.set(to, data);
  }
}

export function parseNavToc(xml: string, navPath: string, rootDir: string): TocEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const navs = $("nav").toArray();
  const tocNav =
    navs.find((nav) => {
      const type = ($(nav).attr("epub:type") ?? $(nav).attr("type") ?? "").split(/\s+/);
      return type.includes("toc");
    }) ?? navs[0];
  if (!tocNav) return [];
  const list = $(tocNav).find("ol").first();
  if (!list.length) return [];

  const parseList = (ol: cheerio.Cheerio<Element>): TocEntry[] => {
    const out: TocEntry[] = [];
    ol.children("li").each((_, li) => {
      const link = $(li).children("a").first();
      const label = collapseWhitespace(link.text());
      const raw = link.attr("href") ?? "";
      if (!label && !raw) return;
      const [file, fragment] = raw.split("#");
      const target = file ? resolveHref(dirname(navPath), file) : navPath;
      void rootDir;
      const childList = $(li).children("ol").first();
      out.push({
        label: label || target,
        href: target,
        fragment: fragment || undefined,
        children: childList.length ? parseList(childList) : [],
      });
    });
    return out;
  };

  return parseList(list);
}

export function parseNcxToc(xml: string, ncxPath: string, rootDir: string): TocEntry[] {
  const doc = tryParseXml<{ ncx?: { navMap?: { navPoint?: unknown } } }>(xml);
  const navMap = doc?.ncx?.navMap;
  if (!navMap) return [];

  const parsePoints = (points: unknown): TocEntry[] => {
    const out: TocEntry[] = [];
    for (const point of asArray(points as Record<string, unknown>[])) {
      if (!point || typeof point !== "object") continue;
      const node = point as Record<string, unknown>;
      const labelNode = asArray(node.navLabel as Record<string, unknown>)[0] as
        | Record<string, unknown>
        | undefined;
      const label = collapseWhitespace(nodeText(labelNode?.text));
      const content = asArray(node.content as Record<string, unknown>)[0] as
        | Record<string, unknown>
        | undefined;
      const raw = content?.["@_src"] ? String(content["@_src"]) : "";
      const [file, fragment] = raw.split("#");
      const target = file ? resolveHref(dirname(ncxPath), file) : ncxPath;
      void rootDir;
      out.push({
        label,
        href: target,
        fragment: fragment || undefined,
        children: parsePoints(node.navPoint),
      });
    }
    return out;
  };

  return parsePoints(navMap.navPoint);
}
