import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveMachineSectorTiles } from "../src/utils/deriveMachineSectorTiles";
import type { AndonCall } from "../src/types/andon";
import type { AndonCategoryConfig } from "../src/types/settings";

const area = (id: string, active = true): AndonCategoryConfig => ({
  id, active, categoryGroup: "maintenance", color: id === "electrical" ? "#D97706" : "#2563EB",
  displayName: id === "electrical" ? "Elétrica" : "Mecânica", displayOrder: id === "electrical" ? 10 : 20,
});
const call = (id: string, subtype: string, status = "open", isSystemTest = false): AndonCall =>
  ({ id, subtype, status, machineId: "37", isSystemTest } as AndonCall);

test("REFINE23: hidden sector is visible only while its real call is open/in attendance/follow-up", () => {
  const catalog = [area("electrical"), area("mechanical", false)];
  const direct = [catalog[0]];
  for (const status of ["open", "in_progress", "post_maintenance"]) {
    const result = deriveMachineSectorTiles(direct, catalog, [call("c1", "mechanical", status)]);
    assert.equal(result.length, 2);
    assert.equal(result[1].category.displayName, "Mecânica");
    assert.equal(result[1].category.color, "#2563EB");
    assert.equal(result[1].activeCall?.id, "c1");
    assert.equal(result[1].temporarilyVisible, true);
    assert.equal(result[0].temporarilyVisible, false);
  }
  for (const status of ["finished", "cancelled"]) {
    assert.deepEqual(deriveMachineSectorTiles(direct, catalog, [call("c1", "mechanical", status)])
      .map(tile => tile.category.id), ["electrical"]);
  }
});

test("REFINE23: group unlink does not affect active-call visibility; repeated groups never duplicate sectors", () => {
  const catalog = [area("electrical"), area("mechanical")];
  const open = [call("c1", "mechanical", "in_progress"), call("c2", "mechanical")];
  const tiles = deriveMachineSectorTiles([catalog[0]], catalog, open);
  assert.equal(tiles.filter(tile => tile.category.id === "mechanical").length, 1);
  assert.equal(tiles[1].activeCall?.id, "c1");
  assert.equal(tiles[1].temporarilyVisible, true);
  assert.deepEqual(deriveMachineSectorTiles([catalog[0]], catalog, []),
    [{ category: catalog[0], activeCall: undefined, temporarilyVisible: false }]);
  assert.deepEqual(catalog.map(item => item.active), [true, true], "no permanent mutation");
});

test("REFINE23: direct sectors keep opening contract; no fake buttons for unknown IDs or system tests", () => {
  const catalog = [area("electrical"), area("mechanical")];
  const tiles = deriveMachineSectorTiles(catalog, catalog,
    [call("c1", "electrical"), call("sys", "mechanical", "open", true), call("bad", "unknown")]);
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].activeCall?.id, "c1");
  assert.equal(tiles[0].temporarilyVisible, false);
  assert.equal(tiles[1].activeCall, undefined);
  assert.equal(tiles[1].temporarilyVisible, false);
});

test("REFINE23: operational panel maps temporary tiles to selection without creating call", async () => {
  const panel = await readFile(new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url), "utf8");
  const machine = await readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/src/access/centralCallReasonsWrite.ts", import.meta.url), "utf8");
  const snapshot = await readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(panel, /deriveMachineSectorTiles\(categories, catalogCategories \?\? categories, activeCalls\)/);
  assert.match(panel, /data-temporary-active=\{temporarilyVisible \? "true" : undefined\}/);
  assert.match(panel, /activeCall \? onSelectCall\(activeCall\.id\) : onOpenSubtype\(category\.id\)/);
  assert.match(machine, /catalogCategories=\{categoryCatalog\}/);
  assert.match(machine, /setCategories\(items\.filter\(category => category\.active && category\.showDirectButton !== false\)\)/);
  assert.match(server, /tx\.callReasonOption\.delete\(/);
  assert.doesNotMatch(server, /tx\.andonCategory\.delete\(/);
  assert.match(snapshot, /model AndonCallReasonSnapshot/);
  assert.doesNotMatch(snapshot.split("model AndonCallReasonSnapshot")[1].split("@@map")[0],
    /@relation\(fields: \[optionId\]/);
});
