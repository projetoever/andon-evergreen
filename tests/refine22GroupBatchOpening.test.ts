import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseGroupBatchSelections } from "../server/src/services/groupBatchOpening.js";

const read = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");
const one = (subtype: string, optionId: string, reasonId = "setup") => ({
  reasonId, optionId, subtype,
  expectedReasonRevision: 1, expectedOptionRevision: 2,
});

test("REFINE22.2: group batch parser allows 2-20 distinct sectors from one group only", () => {
  const parsed = parseGroupBatchSelections(
    [one("electrical", "setup_electrical"), one("mechanical", "setup_mechanical")],
    ["electrical", "mechanical"],
  );
  assert.deepEqual(parsed.map(item => item.subtype), ["electrical", "mechanical"]);
  assert.equal(parsed[0].selection.reasonId, "setup");
  assert.throws(() => parseGroupBatchSelections([one("electrical", "setup_electrical")], ["electrical"]));
  assert.throws(() => parseGroupBatchSelections(
    [one("electrical", "setup_electrical"), one("mechanical", "other_mechanical", "other")],
    ["electrical", "mechanical"],
  ));
  assert.throws(() => parseGroupBatchSelections(
    [one("electrical", "setup_electrical"), one("electrical", "setup_electrical")],
    ["electrical", "electrical"],
  ));
  assert.throws(() => parseGroupBatchSelections(
    [one("electrical", "setup_electrical"), one("mechanical", "setup_electrical")],
    ["electrical", "mechanical"],
  ));
  assert.throws(() => parseGroupBatchSelections(
    [{...one("electrical", "setup_electrical"), maintenanceKpiPolicy: "eligible"},
      one("mechanical", "setup_mechanical")],
    ["electrical", "mechanical"],
  ));
  assert.throws(() => parseGroupBatchSelections(
    [{...one("electrical", "setup_electrical"), expectedReasonRevision: 0},
      one("mechanical", "setup_mechanical")],
    ["electrical", "mechanical"],
  ));
  assert.throws(() => parseGroupBatchSelections(
    [one("electrical", "setup_electrical"), one("mechanical", "setup_mechanical")],
    ["mechanical", "electrical"],
  ));
});

test("REFINE22.2: batch snapshots committed within same transaction after duplicate guard", async () => {
  const [route, batch, security, repo, modal, machine, quick, admin] = await Promise.all([
    read("server/src/routes/andonCalls.ts"),
    read("server/src/access/centralBatchOpenCallWrite.ts"),
    read("server/src/security/centralBatchOpenHttp.ts"),
    read("src/repositories/apiAndonRepository.ts"),
    read("src/components/calls/CallReasonOptionsModal.tsx"),
    read("src/pages/MachineDetailPage.tsx"),
    read("src/components/calls/QuickOpenCallModal.tsx"),
    read("src/components/settings/CallReasonsSettingsTab.tsx"),
  ]);
  const dup = route.indexOf("if (await findDuplicateActiveSectorCall(tx, machineId, subtype))", route.indexOf('app.post<{ Body: BatchOpenAndonCallsBody }>'));
  const snapshot = route.indexOf("const groupSnapshots = new Map",dup);
  const insert = route.indexOf("const createdCall = await tx.andonCall.create",snapshot);
  const record = route.indexOf("await tx.andonCallReasonSnapshot.create", insert);
  assert(dup > 0 && snapshot > dup && insert > snapshot && record > insert,
    "reject duplicates and validate all group selections before creating calls; record each snapshot");
  assert.match(route, /parseGroupBatchSelections\(body\.reasonSelections, subtypes\)/);
  assert.match(batch, /groupBatch: true/);
  assert.match(security, /centralGroupBatchOpenEnabled/);
  assert.match(security, /process\.env\.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED === "1"/);
  assert.match(repo, /reasonSelections: params\.map/);
  assert.match(modal, /onSelectMany/);
  assert.match(modal, /disabled=\{busy \|\| alreadyOpen\}/);
  assert.match(modal, /data-call-sector-active=\{alreadyOpen \? "true" : "false"\}/);
  assert.match(modal, /const selected = available\.filter/);
  assert.match(modal, /Selecione um ou mais setores livres/);
  assert.match(modal, /min-h-12 min-w-40/);
  assert.match(modal, /sectorNames\[option\.legacySubtype/);
  assert.match(machine, /onSelectMany=\{handleSelectReasonOptions\}/);
  assert.match(quick, /await openCalls\(hierarchicalChoices\.map/);
  assert.doesNotMatch(admin, /Nome alternativo no modal \(opcional\)/);
  assert.match(admin, /displayName: area\.displayName/);
});
