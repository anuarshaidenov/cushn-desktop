import { version } from "../../../package.json";
import { parseRelease, type Release } from "./changelog";

const releaseFiles = import.meta.glob<string>("../../../changelog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function loadCurrentRelease(): Release | null {
  const file = `changelog/${version}.md`;
  const markdown = releaseFiles[`../../../${file}`];
  if (markdown === undefined) return hide(`${file} is missing`);
  try {
    return parseRelease(markdown);
  } catch (error) {
    return hide(`${file}: ${(error as Error).message}`);
  }
}

function hide(reason: string): null {
  if (import.meta.env.DEV) console.warn(`What's new is hidden: ${reason}`);
  return null;
}

/** The notes for this build's version; `null` hides What's new. */
export const currentRelease = loadCurrentRelease();
