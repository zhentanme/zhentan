import { describe, expect, it } from "vitest";
import { executionSignPlan } from "./signPlan.js";

describe("executionSignPlan", () => {
  it("signs an agent-drafted, user-signed request tx under the draft rule", () => {
    expect(executionSignPlan({ riskVerdict: "APPROVE", userSignature: "0xsig" }, true)).toEqual({
      purpose: "draft_finalization",
      userApproved: true,
    });
  });

  it("uses the strict execution purpose for ordinary (runtime-screened) proposals", () => {
    expect(executionSignPlan({ riskVerdict: "APPROVE", userSignature: "0xsig" }, false)).toEqual({
      purpose: "execution",
      userApproved: false,
    });
  });

  it("carries approval evidence for REVIEW/BLOCK verdicts on the strict path", () => {
    expect(executionSignPlan({ riskVerdict: "REVIEW", userSignature: "0xsig" }, false)).toEqual({
      purpose: "execution",
      userApproved: true,
    });
    expect(executionSignPlan({ riskVerdict: "BLOCK" }, false)).toEqual({
      purpose: "execution",
      userApproved: true,
    });
  });

  it("fails closed: a linked but UNSIGNED draft gets the strict purpose (runtime refuses)", () => {
    expect(executionSignPlan({ riskVerdict: "APPROVE" }, true)).toEqual({
      purpose: "execution",
      userApproved: false,
    });
    expect(executionSignPlan({ riskVerdict: "APPROVE", userSignature: "" }, true).purpose).toBe(
      "execution"
    );
  });
});
