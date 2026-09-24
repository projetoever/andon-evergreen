import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ActiveCallsBadge,
  MachineSectorButton,
} from "../src/components/machines/MachineActionPanel";
import type { AndonCall } from "../src/types/andon";
import type { AndonCategoryConfig } from "../src/types/settings";

function createCall(id: string, subtype: AndonCall["subtype"]): AndonCall {
  return { id, subtype, status: "open" } as AndonCall;
}

function createCategory(
  id: AndonCategoryConfig["id"],
  displayName: string,
  color: string,
): AndonCategoryConfig {
  return {
    id,
    categoryGroup: "maintenance",
    displayName,
    color,
    active: true,
    displayOrder: 1,
  };
}

const electricalCall = createCall("call-electrical", "electrical");
const mechanicalCall = createCall("call-mechanical", "mechanical");
const electrical = createCategory("electrical", "Elétrica", "#F5B700");
const mechanical = createCategory("mechanical", "Mecânica", "#2563EB");

function renderSector(
  category: AndonCategoryConfig,
  activeCall: AndonCall | undefined,
  selectedCallId: string | null,
) {
  return renderToStaticMarkup(
    <MachineSectorButton
      category={category}
      activeCall={activeCall}
      selectedCallId={selectedCallId}
      className="sector-size"
      onOpenSubtype={() => undefined}
      onSelectCall={() => undefined}
    />,
  );
}

test("cenário A: setor livre mantém a ação de abrir e não aparece selecionado", () => {
  const opened: string[] = [];
  const element = MachineSectorButton({
    category: electrical,
    activeCall: undefined,
    selectedCallId: null,
    className: "sector-size",
    onOpenSubtype: (subtype) => opened.push(subtype),
    onSelectCall: () => assert.fail("setor livre não deve selecionar chamado"),
  });
  (element.props as { onClick: () => void }).onClick();

  const markup = renderSector(electrical, undefined, null);
  assert.deepEqual(opened, [electrical.id]);
  assert.match(markup, /Abrir novo chamado Elétrica/);
  assert.match(markup, /data-call-state="free"/);
  assert.match(markup, /background-color:#F5B700/);
  assert.doesNotMatch(markup, /aria-pressed/);
  assert.doesNotMatch(markup, /Ativo|Selecionado|data-active-ring|data-selection-ring/);
});

test("cenário B: setor ativo fica em grafite, preserva a cor e seleciona sem abrir duplicata", () => {
  const selected: string[] = [];
  const opened: string[] = [];
  const element = MachineSectorButton({
    category: electrical,
    activeCall: electricalCall,
    selectedCallId: mechanicalCall.id,
    className: "sector-size",
    onOpenSubtype: (subtype) => opened.push(subtype),
    onSelectCall: (callId) => selected.push(callId),
  });
  (element.props as { onClick: () => void }).onClick();

  const markup = renderSector(electrical, electricalCall, mechanicalCall.id);
  assert.deepEqual(selected, [electricalCall.id]);
  assert.deepEqual(opened, []);
  assert.match(markup, /data-call-state="active"/);
  assert.match(markup, /background-color:#27313D/);
  assert.match(markup, /border-color:#F5B700/);
  assert.match(markup, /data-active-indicator="true"/);
  assert.match(markup, /data-active-ring="true"/);
  assert.match(markup, /animate-pulse/);
  assert.match(markup, /motion-reduce:animate-none/);
  assert.match(markup, />Ativo</);
  assert.doesNotMatch(markup, /disabled/);
});

test("cenário C: dois setores ativos trocam selectedCallId e não usam seletor adicional", async () => {
  const selected: string[] = [];
  const element = MachineSectorButton({
    category: mechanical,
    activeCall: mechanicalCall,
    selectedCallId: electricalCall.id,
    className: "sector-size",
    onOpenSubtype: () => assert.fail("não deve abrir chamado duplicado"),
    onSelectCall: (callId) => selected.push(callId),
  });
  (element.props as { onClick: () => void }).onClick();
  assert.deepEqual(selected, [mechanicalCall.id]);

  const page = await readFile(
    new URL("../src/pages/MachineDetailPage.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(page, /MachineActiveCallSelector/);
  assert.match(page, /activeCalls=\{activeCalls\}/);
  assert.match(page, /selectedCallId=\{selectedCallId\}/);
  assert.match(page, /onSelectCall=\{setSelectedCallId\}/);
  assert.match(page, /activeCalls\.find\(\(call\) => call\.id === selectedCallId\)/);
  assert.match(page, /await attendCall\(\{ callId: currentCall\.id/);
  assert.match(page, /setCancelCallId\(currentCall\.id\)/);
  assert.match(page, /setFinishCallId\(currentCall\.id\)/);
  assert.match(page, /completeMaintenance\(currentCall\.id\)/);
  assert.match(page, /returnToMaintenance\(currentCall\.id\)/);
});

test("cenário D: selecionado tem hierarquia mais forte que o outro setor ativo", () => {
  const selectedMarkup = renderSector(electrical, electricalCall, electricalCall.id);
  const otherActiveMarkup = renderSector(mechanical, mechanicalCall, electricalCall.id);

  assert.match(selectedMarkup, /aria-pressed="true"/);
  assert.match(selectedMarkup, /data-call-state="selected"/);
  assert.match(selectedMarkup, /background-color:#111827/);
  assert.match(selectedMarkup, /Selecionado/);
  assert.match(selectedMarkup, /data-selection-ring="true"/);
  assert.match(selectedMarkup, /data-selected-inset="true"/);
  assert.match(selectedMarkup, /animate-pulse/);
  assert.match(selectedMarkup, /motion-reduce:animate-none/);
  assert.match(selectedMarkup, /lucide-circle-dot/);
  assert.match(otherActiveMarkup, /aria-pressed="false"/);
  assert.match(otherActiveMarkup, /data-call-state="active"/);
  assert.match(otherActiveMarkup, /Ativo/);
  assert.match(otherActiveMarkup, /data-active-ring="true"/);
  assert.match(otherActiveMarkup, /animate-pulse/);
  assert.doesNotMatch(
    otherActiveMarkup,
    /data-selection-ring|data-selected-inset|lucide-circle-dot/,
  );
});

test("contador de chamados ativos omite zero e distingue singular e plural", () => {
  const emptyMarkup = renderToStaticMarkup(<ActiveCallsBadge count={0} />);
  const singleMarkup = renderToStaticMarkup(<ActiveCallsBadge count={1} />);
  const multipleMarkup = renderToStaticMarkup(<ActiveCallsBadge count={3} />);

  assert.equal(emptyMarkup, "");
  assert.match(singleMarkup, /1 Ativo/);
  assert.match(singleMarkup, /aria-label="1 chamado ativo"/);
  assert.match(multipleMarkup, /3 Ativos/);
  assert.match(multipleMarkup, /aria-label="3 chamados ativos"/);
  assert.match(multipleMarkup, /motion-reduce:animate-none/);
  assert.match(multipleMarkup, /text-amber-200/);
  assert.doesNotMatch(multipleMarkup, /dark:text-amber/);
});

test("badge permanece no fluxo com nomes longos em estados ativo e selecionado", () => {
  const longCategory = createCategory(
    "long-sector",
    "MANUTENÇÃO MECÂNICA LINHA DE ENVASE SECUNDÁRIA",
    "#FF7A00",
  );
  const longCall = createCall("call-long", longCategory.id);
  const activeMarkup = renderSector(longCategory, longCall, electricalCall.id);
  const selectedMarkup = renderSector(longCategory, longCall, longCall.id);

  for (const markup of [activeMarkup, selectedMarkup]) {
    assert.match(markup, /MANUTENÇÃO MECÂNICA LINHA DE ENVASE SECUNDÁRIA/);
    assert.match(markup, /data-call-status-badge="true"/);
    assert.doesNotMatch(markup, /data-call-status-badge="true" class="[^"]*absolute/);
    assert.match(markup, /break-words/);
    assert.match(markup, /overflow-wrap:anywhere/);
  }
});

test("cor escura recebe accent contrastante e cor clara preserva identidade", () => {
  const darkCategory = createCategory("dark-sector", "Setor escuro", "#111827");
  const darkCall = createCall("call-dark", darkCategory.id);
  const darkMarkup = renderSector(darkCategory, darkCall, darkCall.id);
  const darkAccent = darkMarkup.match(
    /data-active-ring="true"[^>]*style="border-color:([^;"]+)/,
  )?.[1];

  assert.ok(darkAccent);
  assert.notEqual(darkAccent.toUpperCase(), darkCategory.color);
  assert.match(darkMarkup, new RegExp(`border-color:${darkAccent}`, "i"));
  assert.match(darkMarkup, new RegExp(`background-color:${darkAccent}`, "i"));
  assert.match(darkMarkup, new RegExp(`color:${darkAccent}`, "i"));

  const lightCategory = createCategory("light-sector", "Setor claro", "#FF7A00");
  const lightCall = createCall("call-light", lightCategory.id);
  const lightMarkup = renderSector(lightCategory, lightCall, electricalCall.id);
  assert.match(lightMarkup, /border-color:#FF7A00/);
  assert.match(lightMarkup, /background-color:#FF7A00/);
});

test("cenário E: chamado encerrado devolve seu setor à abertura e mantém outro selecionável", async () => {
  const opened: string[] = [];
  const selected: string[] = [];
  const freeSector = MachineSectorButton({
    category: electrical,
    activeCall: undefined,
    selectedCallId: mechanicalCall.id,
    className: "sector-size",
    onOpenSubtype: (subtype) => opened.push(subtype),
    onSelectCall: () => assert.fail("setor encerrado não deve selecionar chamado"),
  });
  const activeSector = MachineSectorButton({
    category: mechanical,
    activeCall: mechanicalCall,
    selectedCallId: mechanicalCall.id,
    className: "sector-size",
    onOpenSubtype: () => assert.fail("setor ativo não deve abrir duplicata"),
    onSelectCall: (callId) => selected.push(callId),
  });
  (freeSector.props as { onClick: () => void }).onClick();
  (activeSector.props as { onClick: () => void }).onClick();
  assert.deepEqual(opened, [electrical.id]);
  assert.deepEqual(selected, [mechanicalCall.id]);

  const page = await readFile(
    new URL("../src/pages/MachineDetailPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /if \(!activeCalls\.length\) \{\s*setSelectedCallId\(null\)/);
  assert.match(
    page,
    /setSelectedCallId\(\(current\) => \(current && currentIds\.has\(current\) \? current : preferred\.id\)\)/,
  );
});

test("cenário F: categoria dinâmica reutiliza sua cor no botão e no ring", () => {
  const dynamicCategory = createCategory("custom-sector", "Setor customizado", "#12AB34");
  const dynamicCall = createCall("call-custom", dynamicCategory.id);
  const markup = renderSector(dynamicCategory, dynamicCall, dynamicCall.id);

  assert.match(markup, /background-color:#12AB34/);
  assert.ok((markup.match(/border-color:#12AB34/g) ?? []).length >= 3);
  assert.match(markup, /Selecionado: chamado Setor customizado/);
});
