import { relativeHref } from "../util/path.ts";
import { escapeAttr, escapeXml } from "../util/text.ts";
import { xhtmlDocument } from "../html/xhtml.ts";

export interface NavEntryInput {
  label: string;
  /** Archive path of the target document. */
  href: string;
  fragment?: string;
  children: NavEntryInput[];
}

function linkFrom(fromPath: string, entry: NavEntryInput): string {
  const target = relativeHref(fromPath, entry.href);
  return entry.fragment ? `${target}#${entry.fragment}` : target;
}

export function buildNavDocument(
  entries: NavEntryInput[],
  options: { navPath: string; cssHref?: string; title: string; language: string },
): string {
  const items = (list: NavEntryInput[], depth = 0): string => {
    const pad = "  ".repeat(depth + 3);
    return list
      .map((entry) => {
        const child = entry.children.length
          ? `\n${pad}  <ol>\n${items(entry.children, depth + 1)}\n${pad}  </ol>`
          : "";
        return `${pad}<li><a href="${escapeAttr(linkFrom(options.navPath, entry))}">${escapeXml(
          entry.label,
        )}</a>${child}</li>`;
      })
      .join("\n");
  };

  const firstHref = entries[0] ? linkFrom(options.navPath, entries[0]) : options.navPath;

  const body = `  <nav epub:type="toc" id="toc">
    <h1>${escapeXml(options.title)}</h1>
    <ol>
${items(entries)}
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="hidden">
    <ol>
      <li><a epub:type="toc" href="${escapeAttr(options.navPath.split("/").pop() ?? "nav.xhtml")}">${escapeXml(
        options.title,
      )}</a></li>
      <li><a epub:type="bodymatter" href="${escapeAttr(firstHref)}">${escapeXml(
        options.title,
      )}</a></li>
    </ol>
  </nav>`;

  return xhtmlDocument({
    language: options.language,
    title: options.title,
    cssHref: options.cssHref,
    bodyClass: "toc-page",
    body,
  });
}

export function buildNcxDocument(
  entries: NavEntryInput[],
  options: { ncxPath: string; bookTitle: string; identifier: string },
): string {
  let order = 0;
  const points = (list: NavEntryInput[], depth: number): string => {
    const pad = "  ".repeat(depth + 2);
    return list
      .map((entry) => {
        order += 1;
        const playOrder = order;
        const children = entry.children.length ? `\n${points(entry.children, depth + 1)}` : "";
        return `${pad}<navPoint id="np-${playOrder}" playOrder="${playOrder}">
${pad}  <navLabel><text>${escapeXml(entry.label)}</text></navLabel>
${pad}  <content src="${escapeAttr(linkFrom(options.ncxPath, entry))}"/>${children}
${pad}</navPoint>`;
      })
      .join("\n");
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeAttr(options.identifier)}"/>
    <meta name="dtb:depth" content="3"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(options.bookTitle)}</text></docTitle>
  <navMap>
${points(entries, 0)}
  </navMap>
</ncx>
`;
}
