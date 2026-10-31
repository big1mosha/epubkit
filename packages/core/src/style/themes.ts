export type ThemeName = "classic" | "minimal" | "none";

export interface FontInput {
  data: Uint8Array;
  /** File name used inside the EPUB, e.g. `noto-serif-bengali.woff2`. */
  filename: string;
  family: string;
  weight?: string;
  style?: string;
}

export interface ThemeContext {
  language: string;
  font?: FontInput;
  fonts?: FontInput[];
}

const BASE = `@page {
  margin: 1.5em 2.5em;
}

html {
  font-size: 100%;
}

body {
  margin: 0;
  padding: 0;
  color: #1a1a1a;
  background: #ffffff;
  line-height: 1.8;
  text-align: justify;
  hyphens: manual;
  -webkit-hyphens: manual;
  overflow-wrap: break-word;
}

img {
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}

p {
  margin: 0;
  text-indent: 1.25em;
}

p + p {
  margin-top: 0.35em;
}

h1, h2, h3, h4, h5, h6 {
  text-align: center;
  font-weight: bold;
  line-height: 1.4;
  margin: 1.4em 0 0.8em;
  text-indent: 0;
}

blockquote {
  margin: 1em 1.5em;
  padding-left: 1em;
  border-left: 2px solid #d8d2c4;
  font-style: italic;
}

hr {
  border: 0;
  text-align: center;
  margin: 1.4em 0;
}

hr::after {
  content: "\\2756";
  color: #8a7a5c;
}

ul, ol {
  margin: 0.8em 0;
  padding-left: 1.6em;
  text-align: left;
}

li {
  margin: 0.2em 0;
  text-indent: 0;
}

figure {
  margin: 1.2em 0;
  text-align: center;
  text-indent: 0;
}

figcaption {
  font-size: 0.85em;
  color: #555;
  margin-top: 0.4em;
  text-align: center;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.92em;
}

th, td {
  border: 1px solid #c9c2b4;
  padding: 0.35em 0.5em;
  text-align: left;
  vertical-align: top;
}

code, pre {
  font-family: monospace;
  font-size: 0.9em;
  text-align: left;
}

pre {
  white-space: pre-wrap;
  background: #f6f3ec;
  padding: 0.8em;
  border-radius: 0.2em;
}

sup, sub {
  line-height: 0;
  font-size: 0.75em;
}
`;

const CLASSIC = `
body {
  font-family: "Noto Serif Bengali", "Noto Serif", "Bangla", serif;
  font-size: 1em;
}

.book-title-page,
.halftitle-page,
.colophon-page,
.part-page {
  page-break-before: always;
  break-before: page;
  text-align: center;
}

.halftitle-page {
  padding-top: 38%;
}

.halftitle-page h1 {
  font-size: 1.8em;
  font-weight: normal;
  letter-spacing: 0.02em;
  border: 0;
  margin: 0;
}

.title-page {
  padding-top: 22%;
}

.title-page .book-title {
  font-size: 2.2em;
  font-weight: bold;
  line-height: 1.35;
  margin: 0 0 1.2em;
  color: #5b2c2c;
}

.title-page .book-author {
  font-size: 1.15em;
  margin: 0 0 0.4em;
}

.title-page .book-series {
  font-size: 0.9em;
  color: #6b5a44;
  font-style: italic;
}

.title-page .book-publisher {
  font-size: 0.85em;
  color: #6b5a44;
  margin-top: 3em;
}

.title-page .rule,
.part-page .rule {
  width: 30%;
  margin: 1.6em auto;
  border: 0;
  border-top: 1px solid #b9a98c;
}

.colophon-page {
  padding-top: 30%;
  font-size: 0.85em;
  color: #4a4a4a;
  text-align: center;
}

.colophon-page p {
  text-indent: 0;
  margin: 0.5em 0;
}

.part-page {
  padding-top: 32%;
}

.part-page .part-label {
  font-size: 0.85em;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: #8a7a5c;
  text-indent: 0;
  margin: 0 0 1.4em;
}

.part-page .part-title {
  font-size: 1.9em;
  color: #5b2c2c;
  margin: 0;
  line-height: 1.4;
}

.part-page .ornament {
  color: #8a7a5c;
  font-size: 1.1em;
  text-indent: 0;
  margin-top: 2.4em;
}

.chapter {
  page-break-before: always;
  break-before: page;
}

.chapter.continued {
  page-break-before: auto;
  break-before: auto;
}

.chapter-head {
  text-align: center;
  margin: 0 0 1.8em;
}

.chapter-label {
  font-size: 0.8em;
  letter-spacing: 0.28em;
  color: #8a7a5c;
  text-indent: 0;
  margin: 0 0 0.7em;
}

.chapter-title {
  font-size: 1.5em;
  color: #5b2c2c;
  margin: 0;
}

.topic {
  page-break-before: always;
  break-before: page;
}

.topic-head {
  text-align: center;
  margin: 0 0 1.4em;
}

.topic-title {
  font-size: 1.2em;
  color: #1f3a5f;
  margin: 0;
}

.body-text > p:first-of-type {
  text-indent: 0;
}

.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1.2em 0;
  color: #8a7a5c;
}

.cover-page {
  margin: 0;
  padding: 0;
  text-align: center;
  page-break-after: always;
  break-after: page;
}

.cover-page img {
  max-width: 100%;
  max-height: 100vh;
}

nav#toc ol {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

nav#toc ol ol {
  padding-left: 1.4em;
}

nav#toc li {
  margin: 0.45em 0;
}

nav#toc a {
  text-decoration: none;
}

nav#toc h1 {
  margin-bottom: 1.6em;
}

.center {
  text-align: center;
  text-indent: 0;
}
`;

const MINIMAL = `
body {
  font-family: "Noto Serif Bengali", serif;
  font-size: 1em;
}

.halftitle-page,
.title-page,
.colophon-page,
.part-page {
  page-break-before: always;
  break-before: page;
  text-align: center;
}

.halftitle-page,
.title-page {
  padding-top: 30%;
}

.part-page {
  padding-top: 35%;
}

.part-page .part-label,
.chapter-label {
  font-size: 0.85em;
  letter-spacing: 0.2em;
  text-indent: 0;
}

.part-page .part-title {
  font-size: 1.8em;
}

.chapter {
  page-break-before: always;
  break-before: page;
}

.chapter-head {
  text-align: center;
  margin-bottom: 1.5em;
}

.chapter-title {
  font-size: 1.4em;
}

.topic {
  page-break-before: always;
  break-before: page;
}

.cover-page {
  text-align: center;
  page-break-after: always;
  break-after: page;
}

.cover-page img {
  max-width: 100%;
  max-height: 100vh;
}

nav#toc ol {
  list-style: none;
  padding-left: 0;
}

nav#toc ol ol {
  padding-left: 1.4em;
}
`;

function fontFace(font: FontInput): string {
  return `@font-face {
  font-family: "${font.family}";
  src: url("../fonts/${font.filename}") format("${font.filename.endsWith(".woff2") ? "woff2" : font.filename.endsWith(".otf") ? "opentype" : "truetype"}");
  font-weight: ${font.weight ?? "normal"};
  font-style: ${font.style ?? "normal"};
}
`;
}

export function themeCss(name: ThemeName, context: ThemeContext): string {
  const fonts = context.fonts ?? (context.font ? [context.font] : []);
  const head = name === "none" ? "" : fonts.map(fontFace).join("");
  const theme = name === "minimal" ? MINIMAL : name === "classic" ? CLASSIC : "";
  return `@charset "utf-8";\n\n${head}${BASE}${theme}`;
}

export const THEME_NAMES: ThemeName[] = ["classic", "minimal", "none"];
