import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVirtualKeyboardEdit,
  isVirtualKeyboardInputType,
  resolveVirtualKeyboardLayout,
  scheduleVirtualKeyboardProtectionRelease,
} from "../src/utils/virtualKeyboardUtils";

test("reconhece somente tipos de entrada compatíveis", () => {
  assert.equal(isVirtualKeyboardInputType("text"), true);
  assert.equal(isVirtualKeyboardInputType("password"), true);
  assert.equal(isVirtualKeyboardInputType("number"), true);
  assert.equal(isVirtualKeyboardInputType("file"), false);
  assert.equal(isVirtualKeyboardInputType("checkbox"), false);
  assert.equal(isVirtualKeyboardInputType("time"), false);
});

test("seleciona teclado numérico para PIN e campos numéricos", () => {
  assert.equal(resolveVirtualKeyboardLayout("password", "numeric"), "numeric");
  assert.equal(resolveVirtualKeyboardLayout("number"), "numeric");
  assert.equal(resolveVirtualKeyboardLayout("text"), "letters");
});

test("insere texto na posição do cursor e substitui seleção", () => {
  assert.deepEqual(
    applyVirtualKeyboardEdit({ value: "Mecnica", selectionStart: 3, selectionEnd: 3, key: "â" }),
    { value: "Mecânica", cursor: 4 },
  );
  assert.deepEqual(
    applyVirtualKeyboardEdit({
      value: "Falha X",
      selectionStart: 6,
      selectionEnd: 7,
      key: "elétrica",
    }),
    { value: "Falha elétrica", cursor: 14 },
  );
});

test("apaga seleção ou caractere anterior sem quebrar caracteres Unicode", () => {
  assert.deepEqual(
    applyVirtualKeyboardEdit({
      value: "Falha grave",
      selectionStart: 6,
      selectionEnd: 11,
      key: "backspace",
    }),
    { value: "Falha ", cursor: 6 },
  );
  assert.deepEqual(
    applyVirtualKeyboardEdit({
      value: "OK ✅",
      selectionStart: 4,
      selectionEnd: 4,
      key: "backspace",
    }),
    { value: "OK ", cursor: 3 },
  );
});

test("respeita o tamanho máximo do campo", () => {
  assert.deepEqual(
    applyVirtualKeyboardEdit({
      value: "1234567",
      selectionStart: 7,
      selectionEnd: 7,
      key: "89",
      maxLength: 8,
    }),
    { value: "12345678", cursor: 8 },
  );
});

test("mantém a proteção até restaurar o foco e concluir o próximo frame", () => {
  const frames: Array<() => void> = [];
  const events: string[] = [];

  scheduleVirtualKeyboardProtectionRelease({
    scheduleFrame: (callback) => frames.push(callback),
    restoreFocus: () => events.push("focus"),
    isKeyboardOpen: () => false,
    releaseProtection: () => events.push("release"),
  });

  assert.deepEqual(events, []);
  frames.shift()?.();
  assert.deepEqual(events, ["focus"]);
  frames.shift()?.();
  assert.deepEqual(events, ["focus", "release"]);
});

test("não remove a proteção se o teclado for reaberto durante o fechamento", () => {
  const frames: Array<() => void> = [];
  const events: string[] = [];
  let open = false;

  scheduleVirtualKeyboardProtectionRelease({
    scheduleFrame: (callback) => frames.push(callback),
    restoreFocus: () => {
      events.push("focus");
      open = true;
    },
    isKeyboardOpen: () => open,
    releaseProtection: () => events.push("release"),
  });

  frames.shift()?.();
  frames.shift()?.();
  assert.deepEqual(events, ["focus"]);
});
