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
  margin: 1.5em 2em;
}

html {
  font-size: 100%;
}

body {
  margin: 0;
  padding: 0 1.5em;
  color: #000000;
  background: #ffffff;
  line-height: 1.45;
  text-align: left;
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
  margin: 0 0 0.6em;
  text-indent: 0;
}

h1, h2, h3, h4, h5, h6 {
  text-align: left;
  font-weight: bold;
  line-height: 1.35;
  margin: 1.4em 0 0.7em;
  text-indent: 0;
  color: #000000;
}

blockquote {
  margin: 1em 0 1em 1.2em;
  padding-left: 1em;
  border-left: 2px solid #cccccc;
  font-style: italic;
}

hr {
  border: 0;
  text-align: center;
  margin: 1.4em 0;
}

hr::after {
  content: "\\2756";
  color: #000000;
}

ul, ol {
  margin: 0.8em 0;
  padding-left: 1.6em;
  text-align: left;
}

li {
  margin: 0.25em 0;
  text-indent: 0;
}

figure {
  margin: 1.2em 0;
  text-align: center;
  text-indent: 0;
}

figcaption {
  font-size: 0.85em;
  color: #333333;
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
  border: 1px solid #bbbbbb;
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
  background: #f5f5f5;
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

/* Halftitle: centered vertically and horizontally */
.halftitle-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 85vh;
  text-align: center;
}

.halftitle-page h1 {
  font-size: 1.8em;
  font-weight: normal;
  letter-spacing: 0.02em;
  border: 0;
  margin: 0;
  text-align: center;
}

html, body.title-page {
  height: 100%;
}

/* Title page: title, author, series all centered in the middle of the page */
.title-page {
  display: -webkit-box;
  display: -webkit-flex;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
  -webkit-flex-direction: column;
  flex-direction: column;
  -webkit-box-pack: center;
  -webkit-justify-content: center;
  justify-content: center;
  -webkit-box-align: center;
  -webkit-align-items: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100%;
  height: 100%;
  text-align: center;
}

.title-page section {
  margin: auto;
  width: 100%;
  text-align: center;
}

.title-page .book-title {
  font-size: 2.1em;
  font-weight: bold;
  line-height: 1.3;
  margin: 0 0 1.2em;
  color: #000000;
  text-align: center;
}

.title-page .book-author {
  font-size: 1.15em;
  margin: 0 0 0.5em;
  color: #000000;
  text-align: center;
}

.title-page .book-publisher {
  font-size: 0.85em;
  color: #333333;
  margin-top: 2em;
  text-align: center;
}

.part-page .rule {
  width: 30%;
  margin: 1.4em auto;
  border: 0;
  border-top: 1px solid #999999;
  text-align: center;
}

.colophon-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 85vh;
  font-size: 0.85em;
  color: #333333;
  text-align: center;
}

.colophon-page p {
  text-indent: 0;
  margin: 0.5em 0;
  text-align: center;
}

.part-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 85vh;
  text-align: center;
}

.part-page .part-label {
  font-size: 0.85em;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #000000;
  text-indent: 0;
  margin: 0 0 1.2em;
  text-align: center;
}

.part-page .part-title {
  font-size: 1.9em;
  color: #000000;
  margin: 0;
  line-height: 1.35;
  text-align: center;
}

.part-page .ornament {
  color: #000000;
  font-size: 1.1em;
  text-indent: 0;
  margin-top: 2em;
  text-align: center;
}

.chapter {
  page-break-before: always;
  break-before: page;
}

.chapter.continued {
  page-break-before: auto;
  break-before: auto;
}

/* Chapter heading: left aligned */
.chapter-head {
  text-align: left;
  margin: 0 0 1.6em;
  padding-bottom: 0.6em;
  border-bottom: 1px solid #dddddd;
}

.chapter-label {
  font-size: 0.8em;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #000000;
  text-indent: 0;
  margin: 0 0 0.5em;
  text-align: left;
}

.chapter-title {
  font-size: 1.5em;
  color: #000000;
  margin: 0;
  text-align: left;
}

.topic {
  page-break-before: always;
  break-before: page;
}

/* Topic heading: left aligned */
.topic-head {
  text-align: left;
  margin: 0 0 1.2em;
}

.topic-title {
  font-size: 1.35em;
  color: #000000;
  margin: 0;
  text-align: left;
}

.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1.2em 0;
  color: #000000;
}

.cover-page {
  margin: 0 !important;
  padding: 0 !important;
  text-align: center;
  page-break-after: always;
  break-after: page;
}

.cover-page img {
  max-width: 100%;
  max-height: 100vh;
}

html, body.somapto-page {
  height: 100%;
}

.somapto-page {
  display: -webkit-box;
  display: -webkit-flex;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
  -webkit-flex-direction: column;
  flex-direction: column;
  -webkit-box-pack: center;
  -webkit-justify-content: center;
  justify-content: center;
  -webkit-box-align: center;
  -webkit-align-items: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100%;
  height: 100%;
  text-align: center;
  page-break-before: always;
  break-before: page;
}

.somapto-page section,
.somapto-page .somapto-section {
  margin: auto;
  width: 100%;
  text-align: center;
}

.somapto-page .somapto-text {
  font-size: 2.2em;
  font-weight: bold;
  text-align: center;
  margin: 0;
  color: #000000;
}

.frontmatter-page {
  page-break-before: always;
  break-before: page;
}

.frontmatter-page .body-text {
  margin: 2em 0;
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
  text-align: left;
}

nav#toc a {
  text-decoration: none;
  color: #000000;
}

nav#toc h1 {
  margin-bottom: 1.4em;
  text-align: left;
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

html, body.title-page, body.somapto-page {
  height: 100%;
}

.halftitle-page,
.title-page,
.colophon-page,
.part-page,
.somapto-page {
  page-break-before: always;
  break-before: page;
  display: -webkit-box;
  display: -webkit-flex;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
  -webkit-flex-direction: column;
  flex-direction: column;
  -webkit-box-pack: center;
  -webkit-justify-content: center;
  justify-content: center;
  -webkit-box-align: center;
  -webkit-align-items: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100%;
  height: 100%;
  text-align: center;
}

.title-page section,
.somapto-page section {
  margin: auto;
  width: 100%;
  text-align: center;
}

.somapto-page .somapto-text {
  font-size: 2.2em;
  font-weight: bold;
  text-align: center;
  margin: 0;
  color: #000000;
}

.frontmatter-page {
  page-break-before: always;
  break-before: page;
}

.frontmatter-page .body-text {
  margin: 2em 0;
}

.part-page .part-label,
.chapter-label {
  font-size: 0.85em;
  letter-spacing: 0.2em;
  text-indent: 0;
  text-align: left;
  color: #000000;
}

.part-page .part-title {
  font-size: 1.8em;
  text-align: center;
}

.chapter {
  page-break-before: always;
  break-before: page;
}

.chapter-head {
  text-align: left;
  margin-bottom: 1.4em;
}

.chapter-title {
  font-size: 1.4em;
  text-align: left;
}

.topic {
  page-break-before: always;
  break-before: page;
}

.topic-head {
  text-align: left;
  margin-bottom: 1.2em;
}

.topic-title {
  font-size: 1.3em;
  text-align: left;
}

.cover-page {
  margin: 0 !important;
  padding: 0 !important;
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
