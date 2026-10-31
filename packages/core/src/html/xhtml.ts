import { escapeAttr, escapeXml } from "../util/text.ts";

export interface XhtmlDocumentOptions {
  language: string;
  title: string;
  cssHref?: string;
  bodyClass?: string;
  body: string;
  extraHead?: string;
}

export function xhtmlHead(language: string, title: string, cssHref?: string, extraHead = ""): string {
  const link = cssHref
    ? `\n  <link rel="stylesheet" type="text/css" href="${escapeAttr(cssHref)}"/>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeAttr(
    language,
  )}" lang="${escapeAttr(language)}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>${link}${extraHead ? `\n${extraHead}` : ""}
</head>`;
}

export function xhtmlDocument(options: XhtmlDocumentOptions): string {
  const bodyClass = options.bodyClass ? ` class="${escapeAttr(options.bodyClass)}"` : "";
  return `${xhtmlHead(options.language, options.title, options.cssHref, options.extraHead)}
<body${bodyClass}>
${options.body}
</body>
</html>
`;
}
