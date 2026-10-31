import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { collapseWhitespace, normalizeText } from "../util/text.ts";
import { serializeNodes, type DomNode } from "./serialize.ts";

export const DEFAULT_ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
  "span",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "sup",
  "sub",
  "code",
  "pre",
  "a",
  "div",
] as const;

const DEFAULT_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
  "button",
  "input",
  "select",
  "textarea",
  "form",
  "nav",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  ".simplefavorite-button",
  ".sharedaddy",
  ".jp-relatedposts",
  ".adsbygoogle",
  ".screen-reader-text",
  ".ld-tab-content .ld-tab-content",
  "[class*='advert']",
  "[id*='advert']",
];

const ALIGN_VALUES = new Set(["left", "right", "center", "justify", "start", "end"]);

export interface SanitizeOptions {
  /** Absolute page URL, used to resolve relative image URLs. */
  baseUrl?: string;
  /** Page title; a matching leading heading is removed. */
  title?: string;
  removeSelectors?: string[];
  allowedTags?: string[];
  /** Return a new src, or null to drop the image. */
  rewriteImage?: (src: string, alt: string) => string | null;
  /** Keep class attributes. Off by default. */
  keepClasses?: boolean;
}

function pickSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; weight: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const weight = descriptor?.endsWith("w")
      ? Number(descriptor.slice(0, -1))
      : descriptor?.endsWith("x")
        ? Number(descriptor.slice(0, -1)) * 1000
        : 1;
    if (!best || weight > best.weight) best = { url, weight };
  }
  return best?.url;
}

function absoluteUrl(src: string, baseUrl?: string): string {
  if (!baseUrl) return src;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

function safeHref(href: string): string | null {
  const value = href.trim();
  if (value === "") return null;
  if (/^javascript:/i.test(value)) return null;
  if (/^data:/i.test(value)) return null;
  if (/^(https?:|mailto:|tel:|#|\/|\.\.?\/)/i.test(value)) return value;
  return value;
}

function parseAlign(style: string | undefined): string | null {
  if (!style) return null;
  const match = /text-align\s*:\s*([a-z-]+)/i.exec(style);
  if (!match) return null;
  const value = match[1]!.toLowerCase();
  return ALIGN_VALUES.has(value) ? value : null;
}

function filterAttributes(
  $: cheerio.CheerioAPI,
  element: Element,
  keepClasses: boolean,
): void {
  const node = element as unknown as DomNode;
  const tag = (node.name ?? "").toLowerCase();
  const attribs = node.attribs ?? {};
  const next: Record<string, string> = {};

  const align = parseAlign(attribs.style);
  if (align) next.style = `text-align: ${align}`;

  if (keepClasses && attribs.class) next.class = attribs.class;

  if (attribs.title) next.title = attribs.title;

  if (tag === "a" && attribs.href) {
    const href = safeHref(attribs.href);
    if (href) next.href = href;
  }

  if (tag === "img") {
    if (attribs.src) next.src = attribs.src;
    next.alt = attribs.alt ?? "";
    if (attribs.width && /^\d+%?$/.test(attribs.width)) next.width = attribs.width;
    if (attribs.height && /^\d+%?$/.test(attribs.height)) next.height = attribs.height;
  }

  if (tag === "td" || tag === "th") {
    if (attribs.colspan && /^\d+$/.test(attribs.colspan)) next.colspan = attribs.colspan;
    if (attribs.rowspan && /^\d+$/.test(attribs.rowspan)) next.rowspan = attribs.rowspan;
  }

  if (tag === "ol") {
    if (attribs.start && /^\d+$/.test(attribs.start)) next.start = attribs.start;
    if (attribs.type) next.type = attribs.type;
  }

  node.attribs = next;
  void $;
}

function removeComments($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): void {
  const walk = (element: Element): void => {
    const node = element as unknown as DomNode;
    const children = [...(node.children ?? [])];
    for (const child of children) {
      if (child.type === "comment") {
        $(child as unknown as Element).remove();
      } else if (child.children) {
        walk(child as unknown as Element);
      }
    }
  };
  walk(root[0] as unknown as Element);
}

function stripDuplicateTitle(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  title: string,
): void {
  const wanted = collapseWhitespace(title);
  if (!wanted) return;
  const blocks = root.children("p, h1, h2, h3, h4, div").slice(0, 4).toArray();
  for (const element of blocks) {
    const text = collapseWhitespace($(element).text());
    if (text !== wanted) continue;
    const images = $(element).find("img").length;
    if (images > 0) continue;
    $(element).remove();
    return;
  }
}

function normalizeTextNodes($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): void {
  root.find("*").addBack().each((_, element) => {
    const node = element as unknown as DomNode;
    for (const child of node.children ?? []) {
      if (child.type === "text") child.data = normalizeText(child.data ?? "");
    }
  });
}

/**
 * Clean a WordPress/LearnDash content fragment into safe XHTML.
 * Unknown tags are unwrapped, dangerous nodes are dropped, and inline styles
 * are reduced to text alignment.
 */
export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
  if (!input.trim()) return "";

  const $ = cheerio.load(`<div id="__ek_root">${input}</div>`, null, false);
  const root = $("#__ek_root");
  const allowed = new Set<string>(options.allowedTags ?? [...DEFAULT_ALLOWED_TAGS]);

  removeComments($, root);

  for (const selector of [...DEFAULT_REMOVE_SELECTORS, ...(options.removeSelectors ?? [])]) {
    root.find(selector).remove();
  }

  // Lazy-loaded images: prefer data-src, then the largest srcset candidate.
  root.find("img").each((_, element) => {
    const node = element as unknown as DomNode;
    const attribs = node.attribs ?? {};
    let src = attribs["data-src"] ?? attribs["data-lazy-src"] ?? attribs.src ?? "";
    const srcset =
      pickSrcset(attribs["data-srcset"]) ??
      pickSrcset(attribs.srcset) ??
      pickSrcset(attribs["data-lazy-srcset"]);
    if ((!src || /^data:image\/svg/i.test(src)) && srcset) src = srcset;
    if (!src || /^data:image\/svg/i.test(src)) {
      $(element).remove();
      return;
    }
    src = absoluteUrl(src, options.baseUrl);
    const alt = attribs.alt ?? "";
    const rewritten = options.rewriteImage ? options.rewriteImage(src, alt) : src;
    if (rewritten === null) {
      $(element).remove();
      return;
    }
    node.attribs = { ...attribs, src: rewritten, alt };
  });

  // Unwrap tags that are not allowed but may still carry useful children.
  for (const element of root.find("*").toArray()) {
    const node = element as unknown as DomNode;
    if (node.type !== "tag") continue;
    const tag = (node.name ?? "").toLowerCase();
    if (allowed.has(tag)) continue;
    $(element).replaceWith($(element).contents());
  }

  for (const element of root.find("*").toArray()) {
    if ((element as unknown as DomNode).type !== "tag") continue;
    filterAttributes($, element, options.keepClasses ?? false);
  }

  if (options.title) stripDuplicateTitle($, root, options.title);

  normalizeTextNodes($, root);

  const rootNode = root[0] as unknown as DomNode | undefined;
  const html = serializeNodes(rootNode?.children ?? []);
  return html.trim();
}

/** Plain text of an XHTML fragment, with tags removed. */
export function htmlToText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(`<div id="__ek_root">${html}</div>`, null, false);
  $("#__ek_root").find("script, style, noscript").remove();
  $("#__ek_root").find("br").replaceWith("\n");
  $("#__ek_root").find("p, div, li, h1, h2, h3, h4, h5, h6, tr").each((_, element) => {
    $(element).append("\n");
  });
  return collapseWhitespace($("#__ek_root").text().replace(/\n{2,}/g, "\n"));
}
