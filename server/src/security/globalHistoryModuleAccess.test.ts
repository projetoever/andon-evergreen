import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "../access/policy.js";
import { globalHistoryModuleAccess } from "./globalHistoryModuleAccess.js";

const person = (permissions: string[], machineScope = "selected"): Principal => ({
  userId:"u1", login:"user", displayName:"User", roleLabel:"Gerente",
  accountType:"person", isPrimaryAdmin:false, machineScope, machineIds:["15"],
  permissions, sessionId:"s1", workstationId:"ws1",
  purpose:"normal", authenticatedAt:new Date(),
});

const station = {active:true, pendingApproval:false};

test("HIST-03: history card is OFF and locked without explicit feature opt-in", () => {
  const before = {
    central:process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    history:process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED,
  };
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
    process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="0";
    assert.deepEqual(globalHistoryModuleAccess(
      person(["andon.read","history.read"]), station), {available:false, allowed:false});
    process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="1";
    assert.deepEqual(globalHistoryModuleAccess(
      person(["andon.read"]), station), {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(
      person(["history.read"]), station), {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(
      person(["andon.read","history.read"]), station), {available:true, allowed:true});
    assert.deepEqual(globalHistoryModuleAccess(
      person(["andon.read","history.read"]), {...station,pendingApproval:true}), {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(
      person(["andon.read","history.read"]), {...station,active:false}), {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(
      {...person(["andon.read","history.read"]),purpose:"password_change"}, station),
      {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(
      {...person(["andon.read","history.read"]),accountType:"service"}, station),
      {available:true, allowed:false});
    assert.deepEqual(globalHistoryModuleAccess(null,station),
      {available:true,allowed:false});
    process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
    assert.deepEqual(globalHistoryModuleAccess(person(["andon.read","history.read"]),station),
      {available:false,allowed:false});
  } finally {
    if(before.central===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=before.central;
    if(before.history===undefined)delete process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED=before.history;
  }
});
