import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import ts from "typescript";
import { interfaceMessages, systemMessage, translateLabel } from "../src/i18n/translate";
import { buildHistoryCsv } from "../src/services/exportService";
import type { AndonCall } from "../src/types/andon";
import { validationMessage } from "../src/i18n/validationMessages";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const slots = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sources(path.join(directory, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [path.join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

test("all authored translation keys have English and Traditional Chinese coverage with identical placeholders", async () => {
  const missing: string[] = [];
  for (const file of await sources(new URL("../src", import.meta.url).pathname)) {
    if (file.includes("/i18n/messages") || file.includes("/routeTree.gen")) continue;
    const text = await readFile(file, "utf8");
    const tree = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function notificationCopy(node: ts.Node) {
      if (ts.isStringLiteralLike(node)) {
        const key = normalize(node.text);
        if (key && !interfaceMessages.has(key)) missing.push(`${path.basename(file)}: ${key}`);
      } else if (ts.isTemplateExpression(node)) {
        const key = normalize(
          node.head.text +
            node.templateSpans.map((span, index) => `{${index}}` + span.literal.text).join(""),
        );
        if (key && !interfaceMessages.has(key)) missing.push(`${path.basename(file)}: ${key}`);
      } else if (ts.isConditionalExpression(node)) {
        notificationCopy(node.whenTrue);
        notificationCopy(node.whenFalse);
      } else if (
        ts.isBinaryExpression(node) &&
        [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
          node.operatorToken.kind,
        )
      ) {
        notificationCopy(node.left);
        notificationCopy(node.right);
      }
    }
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        /^toast\.(success|error|warning|info|loading|message)$/.test(
          node.expression.getText(tree),
        ) &&
        node.arguments[0]
      )
        notificationCopy(node.arguments[0]);
      if (
        ts.isCallExpression(node) &&
        /^(?:t|ui)$/.test(node.expression.getText(tree)) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const key = normalize(node.arguments[0].text);
        if (!interfaceMessages.has(key)) missing.push(`${path.basename(file)}: ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(missing, []);
  for (const [source, row] of interfaceMessages) {
    assert.ok(row[1]?.trim(), `English missing: ${source}`);
    assert.ok(row[2]?.trim(), `Chinese missing: ${source}`);
    assert.deepEqual(slots(row[1]), slots(source), `English placeholders: ${source}`);
    assert.deepEqual(slots(row[2]), slots(source), `Chinese placeholders: ${source}`);
  }
});

test("message interpolation never translates or re-interpolates registered names and operator text", () => {
  for (const language of ["pt-BR", "en", "zh-TW"] as const) {
    const userText = "Qualidade {1} <Manutenção> & Máquina 37";
    const result = translateLabel(language, "Localização: {0}", { 0: userText });
    assert.ok(result.includes(userText));
    assert.equal(
      translateLabel(language, "Texto livre não cadastrado no catálogo"),
      "Texto livre não cadastrado no catálogo",
    );
    assert.equal(translateLabel(language, "  Localização: {0} ", { 0: userText }).slice(-1), " ");
  }
});

test("system errors translate at display time while preserving raw diagnostics and inserted identities", () => {
  const error = new Error("Já existe um chamado ativo do setor Qualidade para esta máquina");
  assert.equal(
    systemMessage(error.message, "en"),
    "An active Qualidade sector call already exists for this machine",
  );
  assert.equal(systemMessage(error.message, "zh-TW"), "此機台的 Qualidade 部門已有處理中呼叫");
  assert.equal(error.message, "Já existe um chamado ativo do setor Qualidade para esta máquina");
  assert.equal(
    systemMessage("An active Qualidade sector call already exists for this machine", "pt-BR"),
    error.message,
  );
  assert.equal(
    systemMessage("Falha ao comunicar com a API ANDON (HTTP 503).", "zh-TW"),
    "無法與 ANDON API 通訊（HTTP 503）。",
  );
  assert.equal(systemMessage("Diagnostic code XYZ-92", "en"), "Diagnostic code XYZ-92");
});

test("native required-field and minimum-length validation follows the selected language", () => {
  const validity = { valueMissing: true } as ValidityState;
  assert.equal(validationMessage({ validity }, "pt-BR"), "Preencha este campo.");
  assert.equal(validationMessage({ validity }, "en"), "Fill in this field.");
  assert.equal(validationMessage({ validity }, "zh-TW"), "請填寫此欄位。");
  assert.equal(
    validationMessage({ validity: { tooShort: true } as ValidityState, minLength: 6 }, "en"),
    "Use at least 6 characters.",
  );
});

test("new fixed JSX copy cannot bypass the translation catalog", async () => {
  const issues: string[] = [];
  const brands = new Set(["ANDON", "ANDON BI", "Hub", "HUB", "P", "ID", "ÁÇ"]);
  const textProps = new Set([
    "title",
    "aria-label",
    "aria-roledescription",
    "alt",
    "placeholder",
    "label",
    "description",
    "note",
    "detail",
    "hint",
    "confirmLabel",
    "successLabel",
  ]);
  const root = new URL("../src", import.meta.url).pathname;
  const files = (await sources(root)).filter((file) => file.endsWith(".tsx"));
  for (const file of files) {
    const tree = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (ts.isJsxText(node)) {
        const copy = normalize(node.text);
        if (/[A-Za-zÀ-ž]/.test(copy) && !brands.has(copy))
          issues.push(`${path.basename(file)}: ${copy}`);
      }
      if (
        ts.isJsxAttribute(node) &&
        textProps.has(node.name.getText(tree)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[A-Za-zÀ-ž]/.test(node.initializer.text)
      ) {
        issues.push(`${path.basename(file)}: ${node.getText(tree)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(issues, []);
});

test("ambiguous active labels distinguish registered records, ongoing calls and assets", () => {
  assert.equal(translateLabel("zh-TW", "Ativo", {}, "record"), "啟用");
  assert.equal(translateLabel("zh-TW", "Ativo", {}, "asset"), "資產");
  assert.equal(translateLabel("en", "Ativo", {}, "asset"), "Asset");
  assert.equal(translateLabel("pt-BR", "Ativo", {}, "record"), "Ativo");
  assert.equal(translateLabel("zh-TW", "Ativo"), "處理中");
});

test("CSV localizes authored headers and statuses while preserving registered text", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const call = {
    machineId: "Máquina 37",
    subtype: "electrical",
    category: "maintenance",
    status: "finished",
    technicianName: "Qualidade",
    notes: "Manutenção, texto do operador {0}",
  } as AndonCall;
  const before = JSON.stringify(call);
  try {
    for (const [language, header] of [
      ["en", "Machine;Record type;Status"],
      ["zh-TW", "機台;記錄類型;狀態"],
    ]) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { documentElement: { lang: language } },
      });
      const csv = buildHistoryCsv([call]);
      assert.ok(csv.startsWith(header));
      assert.ok(csv.includes("Máquina 37"));
      assert.ok(csv.includes(";Qualidade;"));
      assert.ok(csv.includes("Manutenção, texto do operador {0}"));
      assert.equal(JSON.stringify(call), before);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
