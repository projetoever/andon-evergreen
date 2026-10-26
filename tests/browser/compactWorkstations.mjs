// Real production frontend, with a stateful isolated HTTP API fixture.
// npm install --no-save playwright (or set ANDON_PLAYWRIGHT_MODULE externally).
// Start `npm run preview -- --host 127.0.0.1 --port 4187` after a production build.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.ANDON_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.ANDON_BROWSER_URL || "http://127.0.0.1:4187";
const output = process.env.ANDON_EVIDENCE_DIR || "docs/validation/compact-workstations-20261026";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.ANDON_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"],
});
const currentId = "ws_00000000-0000-4000-8000-000000000001";
const report = [];
try {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(
      ({ id }) => {
        localStorage.setItem("andon.workstationId", id);
        sessionStorage.setItem(
          "andonAdminSession",
          JSON.stringify({
            token: "isolated-browser-test",
            username: "admin",
            expiresAt: "2099-01-01T00:00:00Z",
          }),
        );
      },
      { id: currentId },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const now = "2026-10-26T17:00:00Z";
    const names = [
      "Notebook Admin",
      "Mi9T",
      "Máquina 37 — kiosk",
      null,
      "Produção " + "IdentificaçãoMuitoLonga".repeat(5),
    ];
    const items = names.map((name, i) => ({
      id: `ws_00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      name,
      active: i !== 1 && i !== 3,
      pendingApproval: i === 3,
      allowOperational: true,
      allowBi: true,
      allowPriorities: false,
      lastIpAddress:
        i === 3
          ? null
          : i === 4
            ? "2001:db8:1234:5678:abcd:1234:5678:abcd"
            : `192.168.68.${100 + i}`,
      lockedMachineId: i === 2 ? "37" : null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    const writes = [];
    const unexpected = [];
    let denyNext = false;
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const json = (body) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/workstations/register") return json(items[0]);
      if (path === "/api/workstations" && req.method() === "GET") return json(items);
      if (path === "/api/modules/settings")
        return json({ hubEnabled: true, requireWorkstationApproval: false });
      if (path === "/api/modules/access")
        return json({
          hubEnabled: true,
          workstation: items[0],
          modules: [
            ["operational", "/andon"],
            ["bi", "/bi"],
            ["priorities", "/machine-priorities"],
          ].map(([id, route]) => ({
            id,
            route,
            name: id,
            description: id,
            icon: "factory",
            available: true,
            enabled: true,
            allowed: true,
            passwordRequired: false,
            authenticated: true,
          })),
        });
      if (path.startsWith("/api/workstations/") && req.method() === "PATCH") {
        assert.equal(req.headers().authorization, "Bearer isolated-browser-test");
        const item = items.find((x) => x.id === path.split("/").pop());
        assert(item);
        if (denyNext) {
          denyNext = false;
          return route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ message: "Alteração não autorizada" }),
          });
        }
        const patch = req.postDataJSON();
        writes.push({ id: item.id, patch });
        Object.assign(item, patch, patch.active === true ? { pendingApproval: false } : {}, {
          updatedAt: now,
        });
        return json(item);
      }
      unexpected.push(`${req.method()} ${path}`);
      return route.fulfill({ status: 404, body: "Unexpected fixture request" });
    });
    const goto = async () => {
      await page.goto(`${baseURL}/hub/admin?section=workstations`);
      await page.getByRole("button", { name: /Notebook Admin/ }).waitFor();
    };
    const trigger = (name) => page.getByRole("button", { name: new RegExp(name) });
    const details = (name) =>
      page
        .locator("div[data-state]")
        .filter({ has: trigger(name) })
        .filter({ has: page.getByText("UUID:", { exact: false }) })
        .last();
    const collapsed = () =>
      page.locator('button[aria-expanded="false"]').filter({ hasText: "Expandir" });
    const checkLayout = async () => {
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(overflow.scroll <= overflow.width, JSON.stringify(overflow));
      // Visible controls must fit their nearest station card; vertical page scrolling is allowed.
      const clipped = await page
        .getByRole("button")
        .filter({ hasText: /Expandir|Recolher/ })
        .evaluateAll((buttons) => {
          const cards = buttons.map((b) => b.parentElement);
          return cards.flatMap((card) => {
            const rect = card.getBoundingClientRect();
            return [...card.querySelectorAll('input,button,[role="switch"]')]
              .filter((el) => el.getClientRects().length)
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.left < rect.left - 1 ||
                  r.right > rect.right + 1 ||
                  r.top < rect.top - 1 ||
                  r.bottom > rect.bottom + 1
                );
              })
              .map((el) => el.outerHTML.slice(0, 100));
          });
        });
      assert.deepEqual(clipped, []);
    };
    await goto();
    assert.equal(await collapsed().count(), 5);
    assert.equal(await page.getByLabel("Nome amigável", { exact: true }).count(), 0);
    await checkLayout();
    await page.screenshot({ path: `${output}/${viewport.width}-collapsed.png`, fullPage: true });
    await trigger("Notebook Admin").focus();
    await page.keyboard.press("Enter");
    const current = details("Notebook Admin");
    assert.equal(await current.getByRole("switch", { name: /Ativação geral/ }).isDisabled(), true);
    assert.equal(
      await current.getByRole("button", { name: "Salvar", exact: true }).isDisabled(),
      true,
    );
    await current.getByLabel("Nome amigável", { exact: true }).fill("  Notebook   Admin  ");
    assert.equal(
      await current.getByRole("button", { name: "Salvar", exact: true }).isDisabled(),
      true,
    );
    await trigger("Máquina 37").click();
    const fixed = details("Máquina 37");
    assert.equal(await fixed.getByRole("switch", { name: /Ativação geral/ }).isDisabled(), true);
    assert.equal(await fixed.getByRole("switch", { name: /ANDON operacional/ }).isDisabled(), true);
    await trigger("Máquina 37").click();
    await checkLayout();
    await page.screenshot({ path: `${output}/${viewport.width}-expanded.png`, fullPage: true });
    await current.getByLabel("Nome amigável", { exact: true }).fill("Notebook Administração");
    await current.getByRole("button", { name: "Salvar", exact: true }).click();
    await trigger("Notebook Administração").waitFor();
    assert.deepEqual(writes.at(-1).patch, { name: "Notebook Administração" });
    await page.reload();
    await trigger("Notebook Administração").waitFor();
    assert.equal(await collapsed().count(), 5);
    const search = page.getByRole("searchbox");
    await search.fill("192.168.68.101");
    assert.equal(await collapsed().count(), 1);
    await trigger("Mi9T").click();
    const blocked = details("Mi9T");
    const activeSwitch = blocked.getByRole("switch", { name: /Ativação geral/ });
    await activeSwitch.click();
    await page.waitForFunction(() =>
      document.querySelector('button[aria-expanded="true"]')?.textContent.includes("Liberado"),
    );
    assert.equal(writes.at(-1).patch.active, true);
    const bi = blocked.getByRole("switch", { name: /ANDON BI/ });
    await bi.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label^="ANDON BI · Mi9T"]')
          ?.getAttribute("aria-checked") === "false",
    );
    assert.equal(writes.at(-1).patch.allowBi, false);
    const operational = blocked.getByRole("switch", { name: /ANDON operacional/ });
    await operational.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label^="ANDON operacional · Mi9T"]')
          ?.getAttribute("aria-checked") === "false",
    );
    assert.equal(writes.at(-1).patch.allowOperational, false);
    const priorities = blocked.getByRole("switch", { name: /Prioridades de produção/ });
    await priorities.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label^="Prioridades de produção · Mi9T"]')
          ?.getAttribute("aria-checked") === "true",
    );
    assert.equal(writes.at(-1).patch.allowPriorities, true);
    denyNext = true;
    await bi.click();
    await page.getByText("Alteração não autorizada", { exact: true }).waitFor();
    assert.equal(await bi.getAttribute("aria-checked"), "false");
    await search.fill("");
    await page.getByRole("button", { name: "Inativas", exact: true }).click();
    assert.equal(await collapsed().count(), 1); // Pending station only, Mi9T was activated.
    await page.getByRole("button", { name: /Aguardando aprovação.*Expandir/ }).click();
    const pending = page.locator('div[data-state="open"]').filter({ hasText: "UUID:" }).last();
    await pending.getByRole("switch", { name: /Ativação geral/ }).click();
    await page.getByText("Nenhuma workstation encontrada", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Ativas", exact: true }).click();

    assert.equal(
      await page
        .getByRole("button")
        .filter({ hasText: /Expandir|Recolher/ })
        .count(),
      5,
    );
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await search.fill("nao-existe-xyz");
    await page.getByText("Nenhuma workstation encontrada", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Limpar pesquisa de workstations", exact: true })
      .click();
    await checkLayout();
    if (viewport.width === 1366) {
      for (const [language, expand, active] of [
        ["en", "Expand", "Active"],
        ["zh-TW", "展開", "啟用"],
      ]) {
        await page.getByRole("combobox").click();
        await page
          .getByRole("option", { name: language === "en" ? "English" : "繁體中文", exact: true })
          .click();
        await page.getByText(expand, { exact: true }).first().waitFor();
        await page.getByRole("button", { name: active, exact: true }).waitFor({ timeout: 5000 });
        assert.equal(await page.getByRole("button", { name: /Notebook Administração/ }).count(), 1);
      }
    }
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    report.push({
      viewport,
      result: "PASS",
      checks: [
        "initial collapse",
        "individual toggles",
        "search/IP/empty",
        "active/inactive filters",
        "normalized save",
        "name after reload",
        "module patch",
        "403 preserves state",
        "current/fixed safeguards",
        "approval",
        "no horizontal overflow/control clipping",
      ],
      writes,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  `${output}/results.json`,
  JSON.stringify({ fixture: "stateful isolated API; no production database", report }, null, 2) +
    "\n",
);
console.log(JSON.stringify(report.map(({ viewport, result }) => ({ viewport, result }))));
