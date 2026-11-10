// Only `src/renderer/data/` may touch the preload bridge or import its client.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const rendererDir = join(import.meta.dirname, "..");
const dataDir = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const outsideData = sourceFiles(rendererDir).filter(
  (path) => !path.startsWith(dataDir + sep) && !path.endsWith(`${sep}env.d.ts`),
);

function offenders(pattern: RegExp): string[] {
  return outsideData
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(rendererDir, path));
}

describe("renderer layering", () => {
  it("scans the renderer sources", () => {
    expect(outsideData.length).toBeGreaterThan(10);
  });

  it("uses window.cushn only inside src/renderer/data", () => {
    expect(offenders(/\bwindow\s*\.\s*cushn\b|\bwindow\s*\[\s*["']cushn["']\s*\]/)).toEqual([]);
  });

  it("imports the bridge client only inside src/renderer/data", () => {
    expect(offenders(/from\s+["'](?:@\/data|\.{1,2}(?:\/[\w.-]+)*\/data)\/client["']/)).toEqual([]);
  });
});
