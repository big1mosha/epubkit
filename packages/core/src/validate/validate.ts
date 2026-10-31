import { XMLValidator } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { Epub } from "../book/reader.ts";
import { firstEntryInfo } from "../archive/zip.ts";

export type IssueLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
  file?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

function collect(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const infos = issues.filter((issue) => issue.level === "info");
  return { ok: errors.length === 0, issues, errors, warnings, infos };
}

export function validateEpub(data: Uint8Array): ValidationResult {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string, file?: string): void => {
    issues.push({ level: "error", code, message, file });
  };
  const warn = (code: string, message: string, file?: string): void => {
    issues.push({ level: "warning", code, message, file });
  };
  const info = (code: string, message: string, file?: string): void => {
    issues.push({ level: "info", code, message, file });
  };

  const first = firstEntryInfo(data);
  if (!first) {
    error("zip-invalid", "File is not a readable ZIP archive");
    return collect(issues);
  }
  if (first.name !== "mimetype") {
    error("mimetype-order", `First archive entry is "${first.name}", expected "mimetype"`);
  }
  if (first.method !== 0) {
    error("mimetype-stored", "The mimetype entry must be stored uncompressed");
  }

  let epub: Epub;
  try {
    epub = Epub.fromBytes(data);
  } catch (cause) {
    error("epub-open", cause instanceof Error ? cause.message : String(cause));
    return collect(issues);
  }

  const mimetype = new TextDecoder().decode(epub.entries.get("mimetype") ?? new Uint8Array());
  if (mimetype.trim() !== "application/epub+zip") {
    error("mimetype-content", `Unexpected mimetype content: "${mimetype.trim()}"`);
  }

  const meta = epub.opf.metadata;
  if (!meta.title.trim()) error("metadata-title", "dc:title is missing");
  if (!meta.identifier.trim()) error("metadata-identifier", "dc:identifier is missing");
  if (!meta.language.trim()) error("metadata-language", "dc:language is missing");
  if (!meta.modified) warn("metadata-modified", "dcterms:modified is missing");
  if (meta.creators.length === 0) warn("metadata-creator", "dc:creator is missing");

  if (epub.opf.version.startsWith("3") && !epub.navItem()) {
    error("nav-missing", "EPUB 3 package has no nav document");
  }

  // Manifest files must exist and stay inside the archive.
  for (const item of epub.opf.manifest) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(item.href)) {
      warn("remote-resource", `Manifest item points to a remote URL: ${item.href}`, item.href);
      continue;
    }
    let path: string;
    try {
      path = epub.itemPath(item);
    } catch (cause) {
      error("manifest-path", cause instanceof Error ? cause.message : String(cause), item.href);
      continue;
    }
    if (!epub.entries.has(path)) {
      error("manifest-missing-file", `Manifest item "${item.id}" points to a missing file`, path);
    }
  }

  const ids = new Set(epub.opf.manifest.map((item) => item.id));
  for (const ref of epub.opf.spine) {
    if (!ids.has(ref.idref)) {
      error("spine-idref", `Spine itemref "${ref.idref}" has no manifest item`);
    }
  }
  if (epub.opf.spine.length === 0) error("spine-empty", "Spine is empty");

  // XHTML checks.
  for (const item of epub.opf.manifest) {
    if (item.mediaType !== "application/xhtml+xml" && item.mediaType !== "text/html") continue;
    let path: string;
    try {
      path = epub.itemPath(item);
    } catch {
      continue;
    }
    const bytes = epub.entries.get(path);
    if (!bytes) continue;
    const text = new TextDecoder().decode(bytes);

    if (/<script[\s>]/i.test(text)) {
      warn("script-found", "Document contains a script", path);
    }

    const result = XMLValidator.validate(text, { allowBooleanAttributes: true });
    if (result !== true) {
      const message = `${result.err.msg} (line ${result.err.line})`;
      if (/Entity '&?\w+' not defined/i.test(message)) {
        warn("xhtml-entity", `Unknown entity: ${message}`, path);
      } else {
        error("xhtml-not-well-formed", `Not well-formed XHTML: ${message}`, path);
      }
    }

    try {
      const $ = cheerio.load(text, { xmlMode: true });
      const seen = new Set<string>();
      $("[id]").each((_, element) => {
        const id = $(element).attr("id");
        if (!id) return;
        if (seen.has(id)) error("duplicate-id", `Duplicate id "${id}"`, path);
        seen.add(id);
      });
    } catch {
      // Parse failures were already reported above.
    }
  }

  // Navigation links must resolve.
  const checkLinks = (entries: ReturnType<Epub["toc"]>, source: string): void => {
    for (const entry of entries) {
      if (!entry.href) {
        warn("toc-empty-href", "Table of contents entry has no target", source);
      } else if (!epub.entries.has(entry.href)) {
        warn("toc-missing-target", `Table of contents target is missing: ${entry.href}`, source);
      }
      checkLinks(entry.children, source);
    }
  };
  checkLinks(epub.toc(), epub.navItem()?.href ?? "nav");

  if (!epub.coverItem()) {
    warn("cover-missing", "No cover image is declared");
  }

  if (epub.hasDrm()) {
    error("drm", "EPUB contains DRM/rights management data");
  } else if (epub.hasEncryption()) {
    info("encryption", "EPUB contains META-INF/encryption.xml (usually font obfuscation)");
  }

  const duplicateManifestIds = new Set<string>();
  for (const item of epub.opf.manifest) {
    if (duplicateManifestIds.has(item.id)) {
      error("manifest-duplicate-id", `Duplicate manifest id "${item.id}"`);
    }
    duplicateManifestIds.add(item.id);
  }

  return collect(issues);
}
