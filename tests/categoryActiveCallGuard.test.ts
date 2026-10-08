import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("setor ativo é serializado com abertura de chamados", async () => {
  const [lock, calls, categories] = await Promise.all([
    readFile(new URL("../server/src/db/andonCategoryFlowLock.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCategories.ts", import.meta.url), "utf8"),
  ]);

  assert.match(lock, /andon-category:/);
  assert.match(lock, /pg_advisory_xact_lock/);

  assert.match(calls, /await lockAndonCategoryFlow\(tx, subtype\)/);
  assert.match(calls, /Setor inválido ou inativo/);
  assert.match(calls, /Setor incompatível com a categoria/);
  assert.match(calls, /for \(const subtype of \[\.\.\.subtypes\]\.sort\(\)\)/);

  const updateRoute = categories.slice(
    categories.indexOf('"/api/andon-categories/:id"'),
    categories.indexOf('app.delete<'),
  );
  const lockIndex = updateRoute.indexOf("await lockAndonCategoryFlow(tx, current.id)");
  const activeCallIndex = updateRoute.indexOf("tx.andonCall.findFirst");
  const updateIndex = updateRoute.indexOf("return tx.andonCategory.update");

  assert.ok(lockIndex >= 0);
  assert.ok(activeCallIndex > lockIndex);
  assert.ok(updateIndex > activeCallIndex);
  assert.match(
    updateRoute,
    /Não é possível inativar ou alterar o grupo de um setor com chamado ativo/,
  );
});
