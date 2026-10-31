import type { CoverAsset } from "../cover/generate.ts";
import type { FontInput, ThemeName } from "../style/themes.ts";

export interface ChapterInput {
  title: string;
  /** XHTML fragment (or a full XHTML document). */
  html?: string;
  id?: string;
  topics?: ChapterInput[];
  /** Render as a full-page title page instead of a chapter page. */
  titlePage?: boolean;
}

export interface PartInput {
  /** Omit for a book whose lessons are top-level. */
  title?: string;
  /** Override the generated "Part One" label. */
  label?: string;
  lessons: ChapterInput[];
}

export interface BookLabels {
  contents: string;
  chapter: string;
  part: string;
  cover: string;
  titlePage: string;
  by: string;
  source: string;
  collected: string;
  personal: string;
  series: string;
}

export interface BookImage {
  /** Path inside `OEBPS`, e.g. `images/foo.jpg`. */
  href: string;
  mediaType: string;
  data: Uint8Array;
}

export interface BookInput {
  title: string;
  authors?: string[];
  language?: string;
  publisher?: string;
  date?: string;
  description?: string;
  subjects?: string[];
  series?: string;
  seriesIndex?: number;
  source?: string;
  rights?: string;
  identifier?: string;
  cover?: CoverAsset;
  /** Extra images referenced by chapter HTML as `../images/<name>`. */
  images?: BookImage[];
  parts: PartInput[];
  style?: ThemeName;
  font?: FontInput;
  /** Several faces of the same family, e.g. regular and bold subsets. */
  fonts?: FontInput[];
  /** Split chapters larger than this many KiB. Default 200. */
  splitSizeKb?: number;
  includeColophon?: boolean;
  /** Overrides the generated colophon text (plain paragraphs). */
  colophon?: string;
  labels?: Partial<BookLabels>;
  modified?: string;
}

export interface BuildResult {
  data: Uint8Array;
  files: string[];
  identifier: string;
}

export const BN_LABELS: BookLabels = {
  contents: "সূচিপত্র",
  chapter: "অধ্যায়",
  part: "অংশ",
  cover: "প্রচ্ছদ",
  titlePage: "শিরোনাম পৃষ্ঠা",
  by: "লেখক",
  source: "উৎস",
  collected: "সংগ্রহ",
  personal: "ব্যক্তিগত ব্যবহারের জন্য। পুনর্বিতরণ নিষিদ্ধ।",
  series: "সিরিজ",
};

export const EN_LABELS: BookLabels = {
  contents: "Contents",
  chapter: "Chapter",
  part: "Part",
  cover: "Cover",
  titlePage: "Title Page",
  by: "By",
  source: "Source",
  collected: "Collected",
  personal: "For personal use only. Do not redistribute.",
  series: "Series",
};

export function labelsFor(language: string): BookLabels {
  return language.toLowerCase().startsWith("bn") ? BN_LABELS : EN_LABELS;
}
