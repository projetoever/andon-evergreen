import assert from "node:assert/strict";
import test from "node:test";
import { AccessError } from "./policy.js";
import {
  validateCentralClassificationCreate, validateCentralClassificationUpdate,
} from "./centralClassificationDomain.js";

function denied(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => error instanceof AccessError && error.code === code);
}
test("SEC-04/2B.4: normal classification has a predictable validated payload", () => {
  assert.deepEqual(validateCentralClassificationCreate({label:" Mechanical ",value:"Mechanical_01"}),{
    label:"Mechanical",value:"mechanical_01",active:true,responsibility:"unassigned",analyticsDisposition:"include",
  });
});
test("SEC-04/2B.4: identifier is immutable and bogus fields cannot enter updates", () => {
  denied(() => validateCentralClassificationUpdate({value:"mechanical_01"},{value:"other",label:"renamed"}),"immutable_classification_identifier");
  denied(() => validateCentralClassificationUpdate({value:"mechanical_01"},{label:"valid",unknown:true} as never),"invalid_classification");
  denied(() => validateCentralClassificationUpdate({value:"mechanical_01"},{}),"invalid_classification");
});
test("SEC-04/2B.4: invalid classification payloads fail closed", () => {
  denied(() => validateCentralClassificationCreate({label:"",value:"ab"}),"invalid_classification");
  denied(() => validateCentralClassificationCreate({label:"Test",value:"../other"}),"invalid_classification");
  denied(() => validateCentralClassificationCreate({label:"Valid",value:"valid",active:"false"}),"invalid_classification");
  denied(() => validateCentralClassificationUpdate({value:"valid"},{active:"false"}),"invalid_classification");
});
test("SEC-04/2B.4: reserved BI exclusions cannot be changed into included maintenance metrics", () => {
  for (const reservedValue of ["test","system_test"]) {
    // Existing reserved values must stay excluded regardless of the caller intent.
    denied(() => validateCentralClassificationUpdate({value:reservedValue},{analyticsDisposition:"include"}),"reserved_classification_exclusion");
  }
});

test("SEC-04: reject malformed or unrecognized classification creation fields", () => {
  denied(() => validateCentralClassificationCreate({label:"Valid",value:"valid",unexpected:"x"} as never),"invalid_classification");
  denied(() => validateCentralClassificationCreate(null as never),"invalid_classification");
  denied(() => validateCentralClassificationUpdate({value:"valid"},null as never),"invalid_classification");
  denied(() => validateCentralClassificationUpdate({value:"valid"},[] as never),"invalid_classification");
});
test("SEC-04: all reserved classifications use excluded analytics dispositions", async () => {
  const { RESERVED_EXCLUSIONS, reservedDisposition } = await import("../analytics/eligibility.js");
  for (const value of RESERVED_EXCLUSIONS) {
    const classification = validateCentralClassificationCreate({label:"Reserved",value});
    assert.equal(classification.analyticsDisposition,reservedDisposition(value));
    denied(() => validateCentralClassificationCreate({label:"Reserved",value,analyticsDisposition:"include"}),"reserved_classification_exclusion");
    denied(() => validateCentralClassificationUpdate({value},{analyticsDisposition:"include"}),"reserved_classification_exclusion");
  }
});
