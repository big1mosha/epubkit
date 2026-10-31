import { XMLParser, XMLValidator } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
});

export function parseXml<T = unknown>(xml: string): T {
  const error = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (error !== true) {
    throw new Error(`Invalid XML: ${error.err.msg} (line ${error.err.line})`);
  }
  return parser.parse(xml) as T;
}

export function tryParseXml<T = unknown>(xml: string): T | null {
  try {
    return parseXml<T>(xml);
  } catch {
    return null;
  }
}

/** fast-xml-parser gives objects for single elements and arrays for repeated ones. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function nodeText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const node = value as Record<string, unknown>;
    if ("#text" in node) return String(node["#text"]);
  }
  return "";
}

/** Local name of a prefixed XML tag (`dc:title` -> `title`). */
export function localName(name: string): string {
  const i = name.indexOf(":");
  return i === -1 ? name : name.slice(i + 1);
}

/** Find all direct children matching a local name, ignoring namespace prefixes. */
export function childrenByLocalName(node: Record<string, unknown>, name: string): unknown[] {
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") || key === "#text") continue;
    if (localName(key) !== name) continue;
    out.push(...asArray(value as unknown[]));
  }
  return out;
}
