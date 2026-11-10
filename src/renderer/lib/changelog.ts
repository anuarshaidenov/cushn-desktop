export type ChangeKind = "new" | "improved" | "fixed";

export interface Change {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  version: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  title: string;
  changes: readonly Change[];
}

export const changelogUrl = "https://cushn.org/changelog";

const changeKinds: readonly ChangeKind[] = ["new", "improved", "fixed"];

/**
 * Parses one `changelog/<version>.md`. The app reads the frontmatter and the
 * `- ` items under `## New`, `## Improved` and `## Fixed`; everything else in
 * the body is for the website.
 */
export function parseRelease(markdown: string): Release {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const frontmatter = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!frontmatter) {
    throw new Error("Missing frontmatter: the file must start with ---");
  }

  const fields = parseFields(frontmatter[1]);
  const version = requireField(fields, "version");
  const date = requireField(fields, "date");
  const title = requireField(fields, "title");
  if (!isCalendarDate(date)) {
    throw new Error(`"date" must be a real YYYY-MM-DD date, got "${date}"`);
  }

  const changes: Change[] = [];
  let kind: ChangeKind | undefined;
  for (const line of text.slice(frontmatter[0].length).split("\n")) {
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const name = heading[2].toLowerCase();
      kind =
        heading[1] === "##" ? changeKinds.find((k) => k === name) : undefined;
      continue;
    }
    const item = /^-\s+(.*\S)/.exec(line);
    if (kind && item) changes.push({ kind, text: item[1] });
  }
  if (changes.length === 0) {
    throw new Error(
      `Release ${version} has no items under ## New, ## Improved or ## Fixed`,
    );
  }

  return { version, date, title, changes };
}

function parseFields(frontmatter: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of frontmatter.split("\n")) {
    const field = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (field) fields.set(field[1], unquote(field[2]));
  }
  return fields;
}

function unquote(value: string): string {
  const quote = value[0];
  if (value.length < 2 || value.at(-1) !== quote) return value;
  if (quote === "'") return value.slice(1, -1).replaceAll("''", "'");
  if (quote === '"') return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  return value;
}

function requireField(fields: Map<string, string>, name: string): string {
  const value = fields.get(name);
  if (!value) throw new Error(`Missing "${name}" in the frontmatter`);
  return value;
}

function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}
