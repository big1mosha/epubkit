import { asArray, nodeText, parseXml } from "./xml.ts";
import { escapeAttr, escapeXml } from "../util/text.ts";

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
  fallback?: string;
}

export interface SpineItem {
  idref: string;
  linear: boolean;
  properties: string[];
}

export interface Creator {
  name: string;
  fileAs?: string;
  role?: string;
}

export interface OpfMetadata {
  title: string;
  creators: Creator[];
  language: string;
  identifier: string;
  identifierType?: string;
  publisher?: string;
  date?: string;
  description?: string;
  subjects: string[];
  rights?: string;
  source?: string;
  series?: string;
  seriesIndex?: number;
  modified?: string;
  coverId?: string;
}

export interface OpfPackage {
  version: string;
  uniqueIdentifier: string;
  metadata: OpfMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  tocId?: string;
}

type Node = Record<string, unknown>;

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const value = (node as Node)[`@_${name}`];
  return value === undefined ? undefined : String(value);
}

export function parseOpf(xml: string): OpfPackage {
  const root = parseXml<{ package?: Node }>(xml).package;
  if (!root) throw new Error("OPF has no <package> element");

  const version = attr(root, "version") ?? "3.0";
  const uniqueIdentifier = attr(root, "unique-identifier") ?? "bookid";

  const metadataNode = asArray(root.metadata as Node | Node[])[0] ?? {};
  const metaEntries = asArray(metadataNode.meta as Node | Node[]);
  const identifiers = asArray(metadataNode["dc:identifier"] as Node | Node[]);

  const identifierNode =
    identifiers.find((node) => attr(node, "id") === uniqueIdentifier) ?? identifiers[0];
  const identifier = nodeText(identifierNode) || "urn:uuid:00000000-0000-4000-8000-000000000000";

  const creators: Creator[] = [];
  for (const node of asArray(metadataNode["dc:creator"] as Node | Node[])) {
    const name = nodeText(node);
    if (!name) continue;
    creators.push({
      name,
      fileAs: attr(node, "file-as"),
      role: attr(node, "role"),
    });
  }

  const seriesMeta = metaEntries.find(
    (node) => attr(node, "property") === "belongs-to-collection",
  );
  const series = seriesMeta ? nodeText(seriesMeta) : undefined;
  const seriesIndexMeta = metaEntries.find((node) => attr(node, "property") === "group-position");
  const seriesIndex = seriesIndexMeta ? Number(nodeText(seriesIndexMeta)) : undefined;

  const modifiedMeta = metaEntries.find((node) => attr(node, "property") === "dcterms:modified");
  const coverMeta = metaEntries.find((node) => attr(node, "name") === "cover");

  const manifest: ManifestItem[] = [];
  const manifestNode = asArray(root.manifest as Node | Node[])[0] ?? {};
  for (const node of asArray(manifestNode.item as Node | Node[])) {
    const id = attr(node, "id");
    const href = attr(node, "href");
    const mediaType = attr(node, "media-type");
    if (!id || !href || !mediaType) continue;
    manifest.push({
      id,
      href,
      mediaType,
      properties: (attr(node, "properties") ?? "").split(/\s+/).filter(Boolean),
      fallback: attr(node, "fallback"),
    });
  }

  const spineNode = asArray(root.spine as Node | Node[])[0] ?? {};
  const spine: SpineItem[] = [];
  for (const node of asArray(spineNode.itemref as Node | Node[])) {
    const idref = attr(node, "idref");
    if (!idref) continue;
    spine.push({
      idref,
      linear: attr(node, "linear") !== "no",
      properties: (attr(node, "properties") ?? "").split(/\s+/).filter(Boolean),
    });
  }

  return {
    version,
    uniqueIdentifier,
    tocId: attr(spineNode, "toc"),
    metadata: {
      title: nodeText(asArray(metadataNode["dc:title"] as Node | Node[])[0]) || "Untitled",
      creators,
      language: nodeText(asArray(metadataNode["dc:language"] as Node | Node[])[0]) || "en",
      identifier,
      publisher: nodeText(asArray(metadataNode["dc:publisher"] as Node | Node[])[0]) || undefined,
      date: nodeText(asArray(metadataNode["dc:date"] as Node | Node[])[0]) || undefined,
      description:
        nodeText(asArray(metadataNode["dc:description"] as Node | Node[])[0]) || undefined,
      subjects: asArray(metadataNode["dc:subject"] as Node | Node[])
        .map((node) => nodeText(node))
        .filter(Boolean),
      rights: nodeText(asArray(metadataNode["dc:rights"] as Node | Node[])[0]) || undefined,
      source: nodeText(asArray(metadataNode["dc:source"] as Node | Node[])[0]) || undefined,
      series,
      seriesIndex: Number.isFinite(seriesIndex) ? seriesIndex : undefined,
      modified: modifiedMeta ? nodeText(modifiedMeta) : undefined,
      coverId: coverMeta ? attr(coverMeta, "content") : undefined,
    },
    manifest,
    spine,
  };
}

export function buildOpf(pkg: OpfPackage, modified: string): string {
  const m = pkg.metadata;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="${escapeAttr(
      pkg.uniqueIdentifier,
    )}" xml:lang="${escapeAttr(m.language)}">`,
  );
  lines.push('  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">');
  lines.push(
    `    <dc:identifier id="${escapeAttr(pkg.uniqueIdentifier)}">${escapeXml(m.identifier)}</dc:identifier>`,
  );
  lines.push(`    <dc:title>${escapeXml(m.title)}</dc:title>`);
  for (const creator of m.creators) {
    const attrs = [
      creator.fileAs ? `file-as="${escapeAttr(creator.fileAs)}"` : "",
      creator.role ? `role="${escapeAttr(creator.role)}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(
      `    <dc:creator${attrs ? ` ${attrs}` : ""}>${escapeXml(creator.name)}</dc:creator>`,
    );
  }
  lines.push(`    <dc:language>${escapeXml(m.language)}</dc:language>`);
  if (m.publisher) lines.push(`    <dc:publisher>${escapeXml(m.publisher)}</dc:publisher>`);
  if (m.date) lines.push(`    <dc:date>${escapeXml(m.date)}</dc:date>`);
  if (m.description) {
    lines.push(`    <dc:description>${escapeXml(m.description)}</dc:description>`);
  }
  for (const subject of m.subjects) {
    lines.push(`    <dc:subject>${escapeXml(subject)}</dc:subject>`);
  }
  if (m.rights) lines.push(`    <dc:rights>${escapeXml(m.rights)}</dc:rights>`);
  if (m.source) lines.push(`    <dc:source>${escapeXml(m.source)}</dc:source>`);
  lines.push(`    <meta property="dcterms:modified">${modified}</meta>`);
  if (m.series) {
    lines.push(
      `    <meta property="belongs-to-collection" id="series">${escapeXml(m.series)}</meta>`,
    );
    lines.push('    <meta refines="#series" property="collection-type">series</meta>');
    if (m.seriesIndex !== undefined) {
      lines.push(`    <meta refines="#series" property="group-position">${m.seriesIndex}</meta>`);
    }
  }
  if (m.coverId) lines.push(`    <meta name="cover" content="${escapeAttr(m.coverId)}"/>`);
  lines.push("  </metadata>");

  lines.push("  <manifest>");
  for (const item of pkg.manifest) {
    const props = item.properties.length ? ` properties="${escapeAttr(item.properties.join(" "))}"` : "";
    const fallback = item.fallback ? ` fallback="${escapeAttr(item.fallback)}"` : "";
    lines.push(
      `    <item id="${escapeAttr(item.id)}" href="${escapeAttr(item.href)}" media-type="${escapeAttr(
        item.mediaType,
      )}"${props}${fallback}/>`,
    );
  }
  lines.push("  </manifest>");

  const toc = pkg.tocId ? ` toc="${escapeAttr(pkg.tocId)}"` : "";
  lines.push(`  <spine${toc}>`);
  for (const item of pkg.spine) {
    const attrs = [
      `idref="${escapeAttr(item.idref)}"`,
      item.linear ? "" : 'linear="no"',
      item.properties.length ? `properties="${escapeAttr(item.properties.join(" "))}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`    <itemref ${attrs}/>`);
  }
  lines.push("  </spine>");
  lines.push("</package>");
  return `${lines.join("\n")}\n`;
}
