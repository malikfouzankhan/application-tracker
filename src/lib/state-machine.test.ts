import { describe, expect, it } from "vitest";
import { appStatusValues } from "@/db/enums";
import {
  APP_TRANSITIONS,
  decideAppTransition,
  isTerminalAppStatus,
  isValidAppTransition,
  isValidJobStageTransition,
} from "./state-machine";

describe("application state machine", () => {
  it("covers every status", () => {
    expect(Object.keys(APP_TRANSITIONS).sort()).toEqual([...appStatusValues].sort());
  });

  it.each([
    ["ready", "applied"],
    ["ready", "withdrawn"],
    ["applied", "oa"],
    ["applied", "interviewing"],
    ["applied", "ghosted"],
    ["oa", "interviewing"],
    ["interviewing", "offer"],
    ["offer", "accepted"],
    ["offer", "declined"],
    ["ghosted", "interviewing"],
    ["ghosted", "rejected"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(isValidAppTransition(from, to)).toBe(true);
    expect(decideAppTransition(from, to, "claude")).toEqual({ allowed: true, override: false });
  });

  it.each([
    ["ready", "interviewing"],
    ["ready", "rejected"],
    ["applied", "offer"],
    ["offer", "rejected"],
    ["ghosted", "withdrawn"],
    ["rejected", "applied"],
    ["accepted", "declined"],
  ] as const)("rejects %s -> %s for Claude", (from, to) => {
    expect(isValidAppTransition(from, to)).toBe(false);
    const decision = decideAppTransition(from, to, "claude");
    expect(decision.allowed).toBe(false);
  });

  it("treats rejected, withdrawn, accepted and declined as terminal", () => {
    for (const s of ["rejected", "withdrawn", "accepted", "declined"] as const) {
      expect(isTerminalAppStatus(s)).toBe(true);
      expect(decideAppTransition(s, "applied", "system").allowed).toBe(false);
    }
    expect(isTerminalAppStatus("ghosted")).toBe(false);
  });

  it("lets the user force an invalid transition as an override", () => {
    expect(decideAppTransition("rejected", "interviewing", "user")).toEqual({
      allowed: true,
      override: true,
    });
    expect(decideAppTransition("ready", "applied", "user")).toEqual({
      allowed: true,
      override: false,
    });
  });

  it("never allows a no-op transition, even for the user", () => {
    expect(decideAppTransition("applied", "applied", "user").allowed).toBe(false);
  });
});

describe("job stage transitions", () => {
  it("follows new -> assessed -> shortlisted | dismissed, any -> archived", () => {
    expect(isValidJobStageTransition("new", "assessed")).toBe(true);
    expect(isValidJobStageTransition("assessed", "shortlisted")).toBe(true);
    expect(isValidJobStageTransition("assessed", "dismissed")).toBe(true);
    expect(isValidJobStageTransition("dismissed", "archived")).toBe(true);
    expect(isValidJobStageTransition("shortlisted", "assessed")).toBe(false);
    expect(isValidJobStageTransition("archived", "new")).toBe(false);
  });
});
