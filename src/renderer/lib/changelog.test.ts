import { describe, expect, it } from "vitest";
import { version } from "../../../package.json";
import { parseRelease } from "./changelog";
import { currentRelease } from "./currentRelease";

const release = (frontmatter: string, body: string) =>
  `---\n${frontmatter}\n---\n\n${body}\n`;

const frontmatter = "version: 1.2.0\ndate: 2026-11-03\ntitle: Bulk select";

describe("parseRelease", () => {
  it("reads the frontmatter and the items of each section", () => {
    const markdown = release(
      frontmatter,
      [
        "## New",
        "",
        "- Drag to select budgets.",
        "- Hold ⌘ for hints.",
        "",
        "## Improved",
        "",
        "- Selection works in both views.",
        "",
        "## Fixed",
        "",
        "- Hints no longer flash.",
      ].join("\n"),
    );

    expect(parseRelease(markdown)).toEqual({
      version: "1.2.0",
      date: "2026-11-03",
      title: "Bulk select",
      changes: [
        { kind: "new", text: "Drag to select budgets." },
        { kind: "new", text: "Hold ⌘ for hints." },
        { kind: "improved", text: "Selection works in both views." },
        { kind: "fixed", text: "Hints no longer flash." },
      ],
    });
  });

  it("unwraps single- and double-quoted values", () => {
    const markdown = release(
      `version: "1.2.0"\ndate: '2026-11-03'\ntitle: 'Don''t lose "work"'`,
      "## Fixed\n\n- Autosave.",
    );

    expect(parseRelease(markdown)).toMatchObject({
      version: "1.2.0",
      date: "2026-11-03",
      title: `Don't lose "work"`,
    });
  });

  it("ignores content meant only for the website", () => {
    const markdown = release(
      `${frontmatter}\nimage: /hero.png`,
      [
        "# Bulk select",
        "",
        "Select many budgets at once.",
        "",
        "![Selecting budgets](./select.png)",
        "",
        "## Fixed",
        "",
        "- Hints no longer flash.",
        "  - A nested detail.",
        "",
        "A paragraph after the list.",
        "",
        "### Under the hood",
        "",
        "- Not a change.",
        "",
        "## Thanks",
        "",
        "- Everyone who reported bugs.",
        "",
        "## New",
        "",
        "- Drag to select budgets.",
      ].join("\n"),
    );

    expect(parseRelease(markdown).changes).toEqual([
      { kind: "fixed", text: "Hints no longer flash." },
      { kind: "new", text: "Drag to select budgets." },
    ]);
  });

  it("reads files with Windows line endings", () => {
    const markdown = release(frontmatter, "## New\n\n- Drag.").replaceAll(
      "\n",
      "\r\n",
    );

    expect(parseRelease(markdown).changes).toEqual([
      { kind: "new", text: "Drag." },
    ]);
  });

  it("rejects a file without frontmatter", () => {
    expect(() => parseRelease("## New\n\n- Drag.\n")).toThrow(
      /missing frontmatter/i,
    );
  });

  it("rejects a missing or empty field", () => {
    const body = "## New\n\n- Drag.";
    expect(() =>
      parseRelease(release("version: 1.2.0\ndate: 2026-11-03", body)),
    ).toThrow(`Missing "title"`);
    expect(() =>
      parseRelease(release(`version: ""\ndate: 2026-11-03\ntitle: T`, body)),
    ).toThrow(`Missing "version"`);
  });

  it("rejects a date that is not a real YYYY-MM-DD", () => {
    const withDate = (date: string) =>
      release(`version: 1.2.0\ndate: ${date}\ntitle: T`, "## New\n\n- Drag.");

    expect(() => parseRelease(withDate("2026-02-30"))).toThrow(/date/);
    expect(() => parseRelease(withDate("2026-11-3"))).toThrow(/date/);
    expect(() => parseRelease(withDate("Nov 3, 2026"))).toThrow(/date/);
  });

  it("rejects a release with no New, Improved or Fixed items", () => {
    expect(() =>
      parseRelease(release(frontmatter, "## Thanks\n\n- Everyone.")),
    ).toThrow(/no items/);
    expect(() => parseRelease(release(frontmatter, "## New\n\n"))).toThrow(
      /no items/,
    );
  });
});

describe("currentRelease", () => {
  it("bundles the notes for package.json's version", () => {
    expect(currentRelease?.version).toBe(version);
  });
});
