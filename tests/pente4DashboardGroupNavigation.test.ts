import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { AndonCall } from "../src/types/andon";
import { getDashboardCallIdentity } from "../src/utils/dashboardCallIdentity";

type DashboardCall = Pick<AndonCall, "subtype" | "callReasonSnapshot">;

function groupCall(
  subtype: string,
  group: string,
  originalSector: string,
): DashboardCall {
  return {
    subtype,
    callReasonSnapshot: {
      reasonId: "group_setup",
      reasonNameSnapshot: group,
      reasonRevision: 1,
      optionId: "option_01",
      optionNameSnapshot: originalSector,
      optionRevision: 1,
      technicalAreaId: subtype,
      nature: "planned_setup",
    },
  };
}

test("PENTE 4-A: direct and legacy calls show only the technical sector", () => {
  assert.deepEqual(getDashboardCallIdentity({ subtype: "mechanical" }), {
    sector: "Mecânica", group: null, label: "Mecânica",
  });
  assert.equal(getDashboardCallIdentity({ subtype: "electrical", callReasonSnapshot: null }).label, "Elétrica");
});

test("PENTE 4-A: immutable reason snapshot labels the correct sector and original group", () => {
  assert.equal(getDashboardCallIdentity(groupCall("mechanical", "SETUP", "Mecânica")).label, "Mecânica — SETUP");
  assert.equal(getDashboardCallIdentity(groupCall("electrical", "APOIO", "Elétrica")).label, "Elétrica — APOIO");
  assert.equal(getDashboardCallIdentity(groupCall("pneumatic", "SETUP", "Pneumática")).label, "Pneumática — SETUP");
  assert.equal(getDashboardCallIdentity(groupCall("mechanical", "SETUP original", "Mecânica")).group, "SETUP original");
});

test("PENTE 4-A: incomplete or inconsistent snapshots do not attribute a group", () => {
  const invalid = groupCall("mechanical", "SETUP", "Mecânica");
  assert.equal(getDashboardCallIdentity({
    ...invalid,
    callReasonSnapshot: { ...invalid.callReasonSnapshot!, reasonNameSnapshot: " " },
  }).label, "Mecânica");
  assert.equal(getDashboardCallIdentity({
    ...invalid,
    callReasonSnapshot: { ...invalid.callReasonSnapshot!, technicalAreaId: "electrical" },
  }).label, "Mecânica");
  assert.equal(getDashboardCallIdentity({
    ...invalid,
    callReasonSnapshot: { ...invalid.callReasonSnapshot!, optionNameSnapshot: "" },
  }).group, null);
});

test("PENTE 4-A: changing the selected simultaneous call changes only its own label", () => {
  const calls = [
    { id: "direct", ...{ subtype: "electrical" } },
    { id: "setup", ...groupCall("mechanical", "SETUP", "Mecânica") },
    { id: "support", ...groupCall("electrical", "APOIO", "Elétrica") },
  ];
  const selected = (id: string) => getDashboardCallIdentity(calls.find(call => call.id === id)!).label;
  assert.equal(selected("direct"), "Elétrica");
  assert.equal(selected("setup"), "Mecânica — SETUP");
  assert.equal(selected("support"), "Elétrica — APOIO");
});

test("PENTE 4-A/B: dashboard binds original snapshot to machine.currentCallId; navigation is shared", async () => {
  const [card, page, nav, priorityPage] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/ModuleNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/DashboardPriorityPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(card, /calls\.find\(\(c\) => c\.id === machine\.currentCallId\)/);
  assert.match(card, /getDashboardCallIdentity\(currentCall\)/);
  assert.match(card, /title=\{currentCallIdentity\?\.label\}/);
  assert.match(card, /data-call-id=\{currentCall\.id\}/);
  assert.doesNotMatch(card, /getCallReasonsCatalog\(/);
  assert.match(page, /<ModuleNavigation showModuleLinks\s*\/>/);
  assert.doesNotMatch(page, /canOpen\("bi"\)|canOpen\("priorities"\)/);
  assert.match(nav, /!grant\?\.available \|\| !grant\.enabled \|\| !grant\.allowed/);
  assert.match(nav, /access\.globalHistory\.allowed === true/);
  assert.match(priorityPage, /isDashboardPriorityAuthenticated\(\)/);
});
