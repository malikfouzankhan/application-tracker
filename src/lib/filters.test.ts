import { describe, expect, it } from "vitest";
import { likePattern, parseApplicationFilters, parseJobFilters, toQuery } from "./filters";

describe("application filters", () => {
  it("parses multi-status, flags, dates and defaults", () => {
    const f = parseApplicationFilters({ status: ["applied", "bogus", "oa"], tier: "fit", scam: "1", createdFrom: "2026-10-01", page: "2" });
    expect(f.status).toEqual(["applied", "oa"]);
    expect(f).toMatchObject({ tier: "fit", scam: true, dream: false, createdFrom: "2026-10-01", page: 2, sort: "activity", view: "table" });
  });

  it("drops invalid values instead of failing", () => {
    const f = parseApplicationFilters({ tier: "great", sort: "random", page: "-3", createdFrom: "yesterday", status: "applied" });
    expect(f).toMatchObject({ tier: undefined, sort: "activity", page: 1, createdFrom: undefined, status: ["applied"] });
  });

  it("round-trips to a query string, skipping defaults", () => {
    const f = parseApplicationFilters({ status: ["applied", "oa"], dream: "1", sort: "fit" });
    expect(toQuery(f)).toBe("?status=applied&status=oa&dream=1&sort=fit");
    expect(toQuery(f, { page: 3 })).toContain("page=3");
    expect(toQuery(parseApplicationFilters({}))).toBe("");
  });
});

describe("job filters", () => {
  it("parses", () => {
    expect(parseJobFilters({ tier: "fit", stage: "new" })).toMatchObject({ tier: "fit", stage: "new", page: 1 });
    expect(parseJobFilters({ tier: "skip", stage: "archived" })).toMatchObject({ tier: undefined, stage: undefined });
  });
});

describe("likePattern", () => {
  it("escapes wildcards", () => {
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
