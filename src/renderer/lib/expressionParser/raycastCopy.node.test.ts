// The Raycast extension ships a copy of this parser, since the Store builds `raycast/` on its own.
// After changing the parser: cp src/renderer/lib/expressionParser/{currencies,evaluator,index,parser,tokenizer,types,units}.ts raycast/src/expressionParser/
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const parserDir = import.meta.dirname;
const copyDir = join(parserDir, "../../../../raycast/src/expressionParser");

const shipped = (dir: string) =>
  readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        !name.endsWith(".test.ts") &&
        name !== "examples.ts",
    )
    .sort();

describe("Raycast copy of the expression parser", () => {
  it("has the same files", () => {
    expect(shipped(copyDir)).toEqual(shipped(parserDir));
  });

  it.each(shipped(parserDir))("%s is identical", (name) => {
    expect(readFileSync(join(copyDir, name), "utf8")).toBe(
      readFileSync(join(parserDir, name), "utf8"),
    );
  });
});
