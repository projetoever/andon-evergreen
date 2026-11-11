import assert from "node:assert/strict";
import test from "node:test";
import { parseReasonOpeningSelection } from "./callReasonOpening.js";

const input = {
  catalogEnabled: true,
  hierarchicalOpeningEnabled: true,
  selection: {
    reasonId: "setup", optionId: "setup_mechanical",
    expectedReasonRevision: 3, expectedOptionRevision: 2,
  },
  legacyCategory: "maintenance",
  legacySubtype: "mechanical",
} as const;

test("S3-B2: valid Setup -> Mecânica selection preserves legacy sector identity", () => {
  assert.deepEqual(parseReasonOpeningSelection(input), {
    reasonId: "setup", optionId: "setup_mechanical",
    expectedReasonRevision: 3, expectedOptionRevision: 2,
    legacyCategory: "maintenance", legacySubtype: "mechanical",
  });
});

test("S3-B2: catalog or operational flag OFF always denies new opening mode", () => {
  for (const patch of [
    { catalogEnabled: false }, { hierarchicalOpeningEnabled: false },
  ]) {
    assert.throws(
      () => parseReasonOpeningSelection({ ...input, ...patch }),
      /hierarchical_calls_disabled/,
    );
  }
});

test("S3-B2: reject malformed IDs, mismatched legacy category and stale/missing revision syntax", () => {
  for (const selection of [
    { reasonId: "../setup" }, { optionId: "setup mechanical" },
    { expectedReasonRevision: 0 }, { expectedOptionRevision: undefined },
    { expectedReasonRevision: 2.5 }, { expectedOptionRevision: -1 },
  ]) {
    assert.throws(() => parseReasonOpeningSelection({
      ...input, selection: { ...input.selection, ...selection },
    }));
  }
  for (const patch of [
    { legacySubtype: "x/y" }, { legacyCategory: "admin" },
    { legacyCategory: null }, { legacySubtype: "" },
  ]) {
    assert.throws(() => parseReasonOpeningSelection({ ...input, ...patch }));
  }
});

test("S3-B2: flags cannot be supplied in the selection object to bypass server policy", () => {
  assert.throws(
    () => parseReasonOpeningSelection({
      ...input,
      catalogEnabled: false,
      selection: { ...input.selection, catalogEnabled: true },
    }),
    /hierarchical_calls_disabled/,
  );
});
