import { describe, expect, it } from "vitest";
import { searchWords } from "../family";

describe("searchWords", () => {
  it("splits on spaces", () => {
    expect(searchWords("  Meena   Sharma ")).toEqual(["Meena", "Sharma"]);
  });

  it("matches any apostrophe style with a one-character wildcard", () => {
    for (const q of ["D'Souza", "D’Souza", "D‘Souza", "Dʼ Souza".replace(" ", ""), "D`Souza"]) {
      expect(searchWords(q)).toEqual(["D_Souza"]);
    }
  });

  it("drops characters that would break or widen the filter", () => {
    expect(searchWords("a%b_c*d,e(f)g\"h\\i")).toEqual(["abcdefghi"]);
    expect(searchWords("%%% ,, ()")).toEqual([]);
    expect(searchWords("'")).toEqual([]);
  });

  it("keeps Indian scripts and emoji as typed", () => {
    expect(searchWords("नीलम मल्होत्रा")).toEqual(["नीलम", "मल्होत्रा"]);
    expect(searchWords("زینب")).toEqual(["زینب"]);
    expect(searchWords("José")).toEqual(["José"]);
  });
});
