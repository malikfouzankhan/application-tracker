import { describe, expect, it } from "vitest";
import { parseExperience, parseExperienceText } from "./exp-parse";

describe("parseExperienceText", () => {
  it.each([
    ["Requires 0-2 years of experience", { min: 0, max: 2 }],
    ["1 to 3 yrs experience in React", { min: 1, max: 3 }],
    ["2+ years of experience with Node.js", { min: 2, max: null }],
    ["Minimum 3 years experience required", { min: 3, max: null }],
    ["minimum of 2 years of professional experience", { min: 2, max: null }],
    ["At least 1 year of experience", { min: 1, max: null }],
    ["Experience: 2–4 years", { min: 2, max: 4 }], // en dash
    ["Experience: 1—3 yrs", { min: 1, max: 3 }], // em dash
    ["Exp: 3 - 5 Years", { min: 3, max: 5 }],
    ["1-3+ years of relevant experience", { min: 1, max: 3 }],
    ["3 years of experience building APIs", { min: 3, max: null }],
    ["Up to 2 years of experience", { min: 0, max: 2 }],
  ])("%s", (text, expected) => {
    expect(parseExperienceText(text)).toEqual(expected);
  });

  it("returns null when nothing is stated", () => {
    expect(parseExperienceText("We are hiring a backend engineer. Great culture.")).toBeNull();
    expect(parseExperienceText("")).toBeNull();
  });

  it("ignores years that are not experience requirements", () => {
    expect(parseExperienceText("Founded 25 years ago, we have customers in 30 countries.")).toBeNull();
    expect(parseExperienceText("A 10+ years old company with great culture")).toBeNull();
  });

  it("picks the lowest stated requirement", () => {
    expect(
      parseExperienceText("5+ years of experience preferred, but 2-4 years of experience is fine."),
    ).toEqual({ min: 2, max: 4 });
  });

  it("swaps reversed ranges and rejects absurd numbers", () => {
    expect(parseExperienceText("3-1 years of experience")).toEqual({ min: 1, max: 3 });
    expect(parseExperienceText("50+ years of experience")).toBeNull();
  });
});

describe("parseExperience (title + description)", () => {
  it("reads the title without needing context words", () => {
    expect(parseExperience("SDE 1 (1-3 yrs)", "")).toEqual({ min: 1, max: 3 });
  });

  it("prefers the title over the description", () => {
    expect(parseExperience("Backend Engineer (0-2 years)", "5+ years of experience")).toEqual({
      min: 0,
      max: 2,
    });
  });

  it("falls back to the description", () => {
    expect(parseExperience("Backend Engineer", "Need 2+ years of experience")).toEqual({
      min: 2,
      max: null,
    });
  });
});
