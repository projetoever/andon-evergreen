import assert from "node:assert/strict";
import test from "node:test";
import { isReasonPresentationOnlyPatch as safe } from "./callReasonPresentationPolicy.js";

test("CFG-08A: delegates may patch presentation fields ONLY, never KPI meaning", () => {
  assert.equal(safe("reason.update",{
    expectedRevision:2,displayName:"Manutenção",color:"#123456",
    active:true,displayOrder:20,
  }),true);
  assert.equal(safe("option.update",{
    expectedRevision:2,active:false,displayName:"Elétrica",
  }),true);
  for(const body of [
    {expectedRevision:2,nature:"planned_setup"},
    {expectedRevision:2,analyticsDisposition:"exclude"},
    {expectedRevision:2,maintenanceKpiPolicy:"eligible"},
    {expectedRevision:2,suggestedResponsibility:"maintenance"},
    {expectedRevision:2,active:true,maintenanceKpiPolicy:"eligible"},
    {expectedRevision:2,active:true,nature:"corrective_failure"},
    {expectedRevision:2,active:true,__proto__:null,reasonId:"any"},
    {active:true},
    {expectedRevision:0,active:true},
    {expectedRevision:1},
    null,
    [],
  ]) assert.equal(safe("reason.update",body),false,JSON.stringify(body));
  for(const body of [
    {expectedRevision:2,natureOverride:"corrective_failure"},
    {expectedRevision:2,maintenanceKpiPolicyOverride:"eligible"},
    {expectedRevision:2,analyticsDispositionOverride:"include"},
    {expectedRevision:2,suggestedResponsibilityOverride:"maintenance"},
    {expectedRevision:2,technicalAreaId:"mechanical"},
  ]) assert.equal(safe("option.update",body),false,JSON.stringify(body));
  assert.equal(safe("option.create",{expectedRevision:2,active:true}),false);
  assert.equal(safe("reason.create",{expectedRevision:2,active:true}),false);
  assert.equal(safe("reason.update",Object.assign(Object.create(null),{expectedRevision:1,active:true})),true);
});
