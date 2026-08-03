import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("returns empty headers/rows for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("parses a simple header + rows", () => {
    const result = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    const result = parseCsv('name,note\n"Doe, John","hello world"');
    expect(result.rows).toEqual([["Doe, John", "hello world"]]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const result = parseCsv('a\n"He said ""hi"""');
    expect(result.rows).toEqual([['He said "hi"']]);
  });

  it("trims whitespace around cells", () => {
    const result = parseCsv("a,b\n  1  ,  2  ");
    expect(result.rows).toEqual([["1", "2"]]);
  });

  it("normalizes CRLF and CR line endings and skips blank lines", () => {
    const result = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r");
    expect(result.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});
