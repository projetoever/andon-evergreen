import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const route = new URL("./andonCalls.ts", import.meta.url);
const getSource = () => readFile(route, "utf8");

test("S3-B2B: current legacy/batch opening remains distinct from central reason selection", async () => {
  const code = await getSource();
  const single = code.split('app.post<{ Body: OpenAndonCallBody }>("/api/andon-calls"')[1]
    .split('app.post<{ Body: BatchOpenAndonCallsBody }>')[0];
  const batch = code.split('app.post<{ Body: BatchOpenAndonCallsBody }>')[1];
  assert.match(single, /hierarchicalOpeningEnabled = centralOpen/);
  assert.match(single, /ANDON_HIERARCHICAL_CALL_OPEN_ENABLED/);
  assert.match(single, /if \(hasReasonSelection && !hierarchicalOpeningEnabled\)/);
  assert.match(single, /resolveOpeningReasonInTransaction\(tx/);
  assert.match(single, /tx\.andonCallReasonSnapshot\.create/);
  assert.match(single, /callId: createdCall\.id/);
  assert.match(single, /await tx\.andonCall\.create/);
  assert.doesNotMatch(batch, /resolveOpeningReasonInTransaction\(tx/);
  assert.doesNotMatch(batch, /andonCallReasonSnapshot\.create/);
});

test("S3-B2B: audit+authentication wrapper and duplicate OS guard are preserved", async () => {
  const code = await getSource();
  assert.match(code, /runCentralOpenCallWrite\(prisma/);
  assert.match(code, /isAuthorizedCentralOpenCall\(request\)/);
  assert.match(code, /assertWorkOrderNumberAvailable\(tx, workOrderNumber, isSystemTest\)/);
  assert.match(code, /findDuplicateActiveSectorCall\(tx, machineId, subtype\)/);
});

test("S3-B5: enabling hierarchy never blocks older single-opening callers without metadata", async () => {
  const code = await readFile(route, "utf8");
  const single = code.split('app.post<{ Body: OpenAndonCallBody }>("/api/andon-calls"')[1]
    .split('app.post<{ Body: BatchOpenAndonCallsBody }>')[0];
  assert.doesNotMatch(single, /call_reason_selection_required/);
  assert.match(single, /hasReasonSelection && !hierarchicalOpeningEnabled/);
  assert.match(single, /reasonSelection: ReasonOpeningSelection \| null = hasReasonSelection/);
  assert.match(single, /openingReasonSnapshot = reasonSelection/);
});
