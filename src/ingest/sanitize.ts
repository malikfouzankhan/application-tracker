import { Parser } from "htmlparser2";

// External text is untrusted (claude.md sections 3.5 and 6.5). This turns job-description HTML
// (or plain text) into plain text and strips content a human reader would not see, which is
// where prompt injections hide.

export const MAX_DESCRIPTION_CHARS = 20_000;

// Elements whose content is never visible text.
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "head",
  "title",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "canvas",
  "audio",
  "video",
  "select",
  "textarea",
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tr",
  "ul",
]);

// Zero-width, bidi controls, soft hyphen, Unicode tag characters and variation selectors
// (used for invisible "ASCII smuggling"), and C0/C1 controls other than tab and newline.
const INVISIBLE_CHARS =
  /[\u{AD}\u{61C}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{206F}\u{FEFF}\u{FE00}-\u{FE0F}\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

const ZERO_LENGTH = /^-?0+(\.0+)?(px|pt|em|rem|%|vh|vw)?$/;

function parseStyle(style: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const name = decl.slice(0, idx).trim().toLowerCase();
    const value = decl
      .slice(idx + 1)
      .replace(/!important/gi, "")
      .trim()
      .toLowerCase();
    if (name) props.set(name, value);
  }
  return props;
}

function normalizeColor(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "");
}

/** True when inline attributes make the element invisible. */
export function isHiddenElement(name: string, attribs: Record<string, string>): boolean {
  if ("hidden" in attribs) return true;
  if (name === "input" && attribs.type?.toLowerCase() === "hidden") return true;

  const style = attribs.style;
  if (!style) return false;
  const css = parseStyle(style);

  if (css.get("display") === "none") return true;
  const visibility = css.get("visibility");
  if (visibility === "hidden" || visibility === "collapse") return true;

  const fontSize = css.get("font-size");
  if (fontSize !== undefined && ZERO_LENGTH.test(fontSize)) return true;

  const opacity = css.get("opacity");
  if (opacity !== undefined && ZERO_LENGTH.test(opacity)) return true;

  const color = normalizeColor(css.get("color"));
  if (color === "transparent") return true;
  const background = normalizeColor(css.get("background-color") ?? css.get("background"));
  if (color && background && color === background) return true;

  // Collapsed boxes: height/width 0 with overflow hidden.
  const overflow = css.get("overflow");
  if (overflow === "hidden") {
    for (const dim of ["height", "max-height", "width", "max-width"]) {
      const v = css.get(dim);
      if (v !== undefined && ZERO_LENGTH.test(v)) return true;
    }
  }

  // Pushed off screen: left/top/text-indent of -999px or more.
  for (const prop of ["left", "top", "text-indent", "margin-left"]) {
    const v = css.get(prop);
    if (v && /^-\d{3,}(\.\d+)?(px|em|rem|pt)?$/.test(v)) return true;
  }

  return false;
}

function htmlToText(html: string): string {
  const out: string[] = [];
  // One entry per open element: whether it (or an ancestor) hides its content.
  const stack: { name: string; hidden: boolean }[] = [];
  const hiddenNow = () => stack.length > 0 && stack[stack.length - 1].hidden;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const hidden = hiddenNow() || DROP_TAGS.has(name) || isHiddenElement(name, attribs);
        stack.push({ name, hidden });
        if (hidden) return;
        if (name === "br") out.push("\n");
        else if (name === "li") out.push("\n- ");
        else if (BLOCK_TAGS.has(name)) out.push("\n");
        else if (name === "td" || name === "th") out.push(" ");
      },
      ontext(text) {
        if (!hiddenNow()) out.push(text);
      },
      onclosetag(name) {
        // htmlparser2 closes implied/void elements itself, so the top of the stack matches.
        const top = stack.pop();
        // <li> already starts its own line, so it adds no newline when it closes.
        if (top && !top.hidden && BLOCK_TAGS.has(name) && name !== "li") out.push("\n");
      },
      // Comments and processing instructions are ignored (no handlers).
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );

  parser.write(html);
  parser.end();
  return out.join("");
}

const LOOKS_LIKE_HTML = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>|<!--|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}]/gu, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let cut = text.slice(0, max);
  // Do not leave half of a surrogate pair at the end.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return { text: cut.trimEnd(), truncated: true };
}

/**
 * Untrusted HTML or text to safe plain text: drops comments, scripts, styles and hidden
 * elements, decodes entities, removes invisible/control characters, collapses whitespace,
 * caps the length.
 */
export function sanitizeExternalText(
  input: string | null | undefined,
  maxChars: number = MAX_DESCRIPTION_CHARS,
): { text: string; truncated: boolean } {
  if (!input) return { text: "", truncated: false };
  const raw = LOOKS_LIKE_HTML.test(input) ? htmlToText(input) : input;
  return truncate(collapseWhitespace(raw.replace(INVISIBLE_CHARS, "")), maxChars);
}

/**
 * Decodes HTML entities without interpreting tags. For sources that HTML-escape their HTML
 * (Greenhouse `content`), so it can then go through sanitizeExternalText as real HTML.
 */
export function decodeHtmlEntities(input: string): string {
  const out: string[] = [];
  const parser = new Parser({ ontext: (text) => out.push(text) }, { decodeEntities: true });
  // Escaped HTML has no literal "<", so the whole input is text. Guard anyway.
  parser.write(input.replace(/</g, "&lt;"));
  parser.end();
  return out.join("");
}

/** Short single-line fields (titles, company names, locations). */
export function sanitizeLine(input: string | null | undefined, maxChars = 300): string {
  return sanitizeExternalText(input, maxChars).text.replace(/\s*\n+\s*/g, " ");
}
