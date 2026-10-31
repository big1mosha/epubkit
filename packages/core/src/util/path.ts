/** Resolve a possibly relative href against a directory inside the EPUB. */
export function resolveHref(baseDir: string, href: string): string {
  const clean = href.split("#")[0]!.split("?")[0]!;
  if (clean === "") return baseDir.replace(/\/+$/, "");
  const base = clean.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  const parts = clean.replace(/^\/+/, "").split("/");
  const out = [...base];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) throw new Error(`Path escapes archive root: ${href}`);
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/** Directory part of an archive path. */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Join path segments, normalising separators. */
export function joinPath(...segments: string[]): string {
  return segments
    .filter((s) => s !== "")
    .join("/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "");
}

/** Relative href from one archive file to another. */
export function relativeHref(fromFile: string, toFile: string): string {
  const from = dirname(fromFile).split("/").filter(Boolean);
  const to = toFile.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const up = from.length - i;
  return [...Array<string>(up).fill(".."), ...to.slice(i)].join("/") || toFile;
}

/** Reject archive paths that try to escape the root. */
export function assertSafePath(path: string): void {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) {
    throw new Error(`Absolute path is not allowed: ${path}`);
  }
  const segments = path.split(/[\\/]+/);
  if (segments.includes("..")) {
    throw new Error(`Path traversal is not allowed: ${path}`);
  }
}

/** Normalise a URL-ish string for comparisons. */
export function normalizeHref(href: string): string {
  return decodeURI(href.split("#")[0]!).replace(/^\.\//, "");
}
