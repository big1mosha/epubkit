const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

export interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

export function serializeNode(node: DomNode): string {
  if (node.type === "text") return escapeText(node.data ?? "");
  if (node.type === "comment" || node.type === "directive" || node.type === "cdata") return "";
  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
    return serializeNodes(node.children ?? []);
  }

  const name = (node.name ?? "").toLowerCase();
  if (!name) return serializeNodes(node.children ?? []);

  const attributes = Object.entries(node.attribs ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key.toLowerCase()}="${escapeAttribute(String(value))}"`)
    .join("");

  if (VOID_ELEMENTS.has(name)) return `<${name}${attributes}/>`;

  const inner = RAW_TEXT_ELEMENTS.has(name)
    ? (node.children ?? []).map((child) => child.data ?? "").join("")
    : serializeNodes(node.children ?? []);

  return `<${name}${attributes}>${inner}</${name}>`;
}

export function serializeNodes(nodes: DomNode[]): string {
  return nodes.map(serializeNode).join("");
}

export function textContent(node: DomNode): string {
  if (node.type === "text") return node.data ?? "";
  if (node.type === "comment" || node.type === "directive") return "";
  return (node.children ?? []).map(textContent).join("");
}
