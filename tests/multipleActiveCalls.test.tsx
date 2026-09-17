import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MachineActiveCallSelector } from "../src/components/machines/MachineActiveCallSelector";
import type { AndonCall } from "../src/types/andon";

function createCall(id: string, subtype: AndonCall["subtype"]): AndonCall {
  return { id, subtype, status: "open" } as AndonCall;
}

const electricalCall = createCall("call-electrical", "electrical");
const mechanicalCall = createCall("call-mechanical", "mechanical");

test("exibe seletor somente quando existem múltiplos chamados", () => {
  const singleCallMarkup = renderToStaticMarkup(
    <MachineActiveCallSelector
      calls={[electricalCall]}
      selectedCallId={electricalCall.id}
      onSelect={() => undefined}
    />,
  );
  const multipleCallsMarkup = renderToStaticMarkup(
    <MachineActiveCallSelector
      calls={[electricalCall, mechanicalCall]}
      selectedCallId={electricalCall.id}
      onSelect={() => undefined}
    />,
  );

  assert.equal(singleCallMarkup, "");
  assert.equal((multipleCallsMarkup.match(/<button/g) ?? []).length, 2);
});

test("mantém indicadores textual, visual e acessível usando a cor configurada", () => {
  const markup = renderToStaticMarkup(
    <MachineActiveCallSelector
      calls={[electricalCall, mechanicalCall]}
      selectedCallId={electricalCall.id}
      onSelect={() => undefined}
    />,
  );

  assert.match(markup, /Elétrica/);
  assert.match(markup, /Mecânica/);
  assert.match(markup, /Selecionado/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /background-color:#F5B700/);
  assert.match(markup, /border-color:#F5B700/);
});

test("seletor fica imediatamente antes das ações e ambas usam currentCall", async () => {
  const [page, selector] = await Promise.all([
    readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/machines/MachineActiveCallSelector.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const selectorMatches = [...page.matchAll(/<MachineActiveCallSelector/g)];
  const selectorPosition = page.indexOf("<MachineActiveCallSelector");
  const actionPanelPosition = page.indexOf("<MachineActionPanel");

  assert.equal(selectorMatches.length, 1);
  assert.ok(selectorPosition >= 0 && selectorPosition < actionPanelPosition);
  assert.match(page.slice(selectorPosition, actionPanelPosition), /onSelect=\{setSelectedCallId\}/);
  assert.match(page, /activeCalls\.find\(\(call\) => call\.id === selectedCallId\)/);
  assert.match(page, /currentCall=\{currentCall\}/);
  assert.match(page, /await attendCall\(\{ callId: currentCall\.id/);
  assert.match(page, /setCancelCallId\(currentCall\.id\)/);
  assert.match(page, /setFinishCallId\(currentCall\.id\)/);
  assert.match(page, /completeMaintenance\(currentCall\.id\)/);
  assert.match(page, /returnToMaintenance\(currentCall\.id\)/);
  assert.match(selector, /getCallTypeOption\(call\.subtype\)/);
  assert.match(selector, /callType\?\.color/);
});
