import { imageSize } from "image-size";
import { escapeXml } from "../util/text.ts";

export interface ImageInfo {
  width: number;
  height: number;
  type?: string;
}

export interface CoverAsset {
  data: Uint8Array;
  mediaType: string;
  ext: string;
}

export interface CoverCheck {
  width: number;
  height: number;
  ratio: number;
  ok: boolean;
  reason?: string;
}

export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 2400;
export const TARGET_RATIO = COVER_WIDTH / COVER_HEIGHT;

export function inspectImage(data: Uint8Array): ImageInfo | null {
  try {
    const size = imageSize(data);
    if (!size.width || !size.height) return null;
    return { width: size.width, height: size.height, type: size.type };
  } catch {
    return null;
  }
}

/** A site cover is usable only if it is large enough and close to 2:3. */
export function checkCover(data: Uint8Array, minWidth = 800, tolerance = 0.08): CoverCheck {
  const info = inspectImage(data);
  if (!info) {
    return { width: 0, height: 0, ratio: 0, ok: false, reason: "unreadable image" };
  }
  const ratio = info.width / info.height;
  if (info.width < minWidth) {
    return {
      width: info.width,
      height: info.height,
      ratio,
      ok: false,
      reason: `width ${info.width}px is below ${minWidth}px`,
    };
  }
  if (Math.abs(ratio - TARGET_RATIO) > tolerance) {
    return {
      width: info.width,
      height: info.height,
      ratio,
      ok: false,
      reason: `aspect ratio ${ratio.toFixed(2)} is not close to ${TARGET_RATIO.toFixed(2)}`,
    };
  }
  return { width: info.width, height: info.height, ratio, ok: true };
}

function wrapTitle(title: string, maxChars: number): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return [title];
  return lines;
}

export interface CoverText {
  title: string;
  authors?: string[];
  series?: string;
  imprint?: string;
}

/** A clean typographic cover, rendered as SVG at 1600x2400. */
export function renderCoverSvg(input: CoverText): string {
  const width = COVER_WIDTH;
  const height = COVER_HEIGHT;
  const titleSize = input.title.length > 60 ? 104 : input.title.length > 30 ? 120 : 140;
  const lines = wrapTitle(input.title, Math.floor((width - 400) / (titleSize * 0.52)));
  const lineHeight = Math.round(titleSize * 1.35);
  const blockHeight = lines.length * lineHeight;
  const titleTop = Math.round(height * 0.34 - blockHeight / 2) + titleSize;
  const authorTop = titleTop + blockHeight + Math.round(titleSize * 1.6);

  const titleLines = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${titleTop + index * lineHeight}" text-anchor="middle" font-family="'Noto Serif Bengali','Noto Serif',serif" font-size="${titleSize}" font-weight="bold" fill="#5b2c2c">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  const series = input.series
    ? `<text x="${width / 2}" y="${Math.round(height * 0.22)}" text-anchor="middle" font-family="'Noto Serif Bengali','Noto Serif',serif" font-size="52" letter-spacing="8" fill="#8a7a5c">${escapeXml(input.series)}</text>`
    : "";

  const authors = (input.authors ?? []).join(", ");
  const author = authors
    ? `<text x="${width / 2}" y="${authorTop}" text-anchor="middle" font-family="'Noto Serif Bengali','Noto Serif',serif" font-size="76" fill="#3a3a3a">${escapeXml(authors)}</text>`
    : "";

  const imprint = input.imprint
    ? `<text x="${width / 2}" y="${height - 260}" text-anchor="middle" font-family="'Noto Serif Bengali','Noto Serif',serif" font-size="42" letter-spacing="4" fill="#8a7a5c">${escapeXml(input.imprint)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fbf8f1"/>
  <rect x="80" y="80" width="${width - 160}" height="${height - 160}" fill="none" stroke="#c9bda6" stroke-width="3"/>
  <rect x="110" y="110" width="${width - 220}" height="${height - 220}" fill="none" stroke="#e2d9c8" stroke-width="1"/>
  ${series}
  ${titleLines}
  <line x1="${width / 2 - 90}" y1="${titleTop + blockHeight + 40}" x2="${width / 2 + 90}" y2="${titleTop + blockHeight + 40}" stroke="#b9a98c" stroke-width="2"/>
  <text x="${width / 2}" y="${titleTop + blockHeight + 140}" text-anchor="middle" font-family="'Noto Serif Bengali','Noto Serif',serif" font-size="60" fill="#8a7a5c">\u2756</text>
  ${author}
  ${imprint}
</svg>
`;
}

/** Try to rasterise the SVG with sharp; fall back to SVG if unavailable. */
export async function rasterizeCover(svg: string): Promise<CoverAsset | null> {
  try {
    const spec = "sharp";
    const mod = (await import(spec)) as { default: (input: Buffer) => any };
    const buffer = await mod
      .default(Buffer.from(svg))
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { data: new Uint8Array(buffer), mediaType: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  }
}

export async function generateCover(input: CoverText): Promise<CoverAsset> {
  const svg = renderCoverSvg(input);
  const raster = await rasterizeCover(svg);
  if (raster) return raster;
  return {
    data: new TextEncoder().encode(svg),
    mediaType: "image/svg+xml",
    ext: "svg",
  };
}

export function coverFromBytes(data: Uint8Array): CoverAsset | null {
  const info = inspectImage(data);
  const type = info?.type ?? sniffType(data);
  if (!type) return null;
  const ext = type === "jpg" ? "jpg" : type;
  const mediaType =
    type === "jpg"
      ? "image/jpeg"
      : type === "svg"
        ? "image/svg+xml"
        : `image/${type}`;
  return { data, mediaType, ext };
}

function sniffType(data: Uint8Array): string | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8) return "jpg";
  if (data[0] === 0x89 && data[1] === 0x50) return "png";
  if (data[0] === 0x47 && data[1] === 0x49) return "gif";
  if (data[8] === 0x57 && data[9] === 0x45) return "webp";
  const head = new TextDecoder().decode(data.subarray(0, 200)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "svg";
  return null;
}
