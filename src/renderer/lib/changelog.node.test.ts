// Each file is bundled into the app and rendered on cushn.org/changelog; a
// missing or broken file for the current version hides What's new.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { version } from "../../../package.json";
import { parseRelease } from "./changelog";

const changelogDir = join(import.meta.dirname, "../../../changelog");
const files = readdirSync(changelogDir).filter((file) => file.endsWith(".md"));

describe("changelog files", () => {
  it("has a file for package.json's version", () => {
    expect(files).toContain(`${version}.md`);
  });

  it.each(files)("%s parses and matches its filename", (file) => {
    const release = parseRelease(
      readFileSync(join(changelogDir, file), "utf8"),
    );
    expect(`${release.version}.md`).toBe(file);
  });
});
