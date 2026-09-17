import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CallIdLabel } from "../src/components/common/CallIdLabel";
import { MachineCurrentCallPanel } from "../src/components/machines/MachineCurrentCallPanel";

const CALL_ID = "cmg9abc123examplecallid";

test("exibe o identificador completo e sem transformação", () => {
  const markup = renderToStaticMarkup(<CallIdLabel callId={CALL_ID} />);

  assert.match(markup, new RegExp(`ID do chamado: ${CALL_ID}`));
  assert.match(markup, new RegExp(`title="ID do chamado: ${CALL_ID}"`));
  assert.match(markup, /break-all/);
  assert.match(markup, /max-w-full/);
});

test("integra o mesmo ID no histórico e no chamado ativo", async () => {
  const [history, currentCallPanel, label] = await Promise.all([
    readFile(new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/components/common/CallIdLabel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(history, /<CallIdLabel callId=\{call\.id\}/);
  assert.match(currentCallPanel, /<CallIdLabel callId=\{call\.id\}/);
  assert.doesNotMatch(label, /\.slice\(|\.substring\(|\.replace\(/);
});

test("não exibe ID quando não existe chamado ativo", () => {
  const markup = renderToStaticMarkup(<MachineCurrentCallPanel call={null} />);

  assert.doesNotMatch(markup, /ID do chamado/);
  assert.match(markup, /Sem chamado ativo/);
});
