import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { request } from "node:http";

const { chromium } = await import(process.env.ANDON_PLAYWRIGHT_MODULE || "playwright");
const output = "docs/validation/hub-admin-navigation-20261027";
await mkdir(output, { recursive: true });

const proxy = createServer(
  {
    key: await readFile(process.env.ANDON_TEST_TLS_KEY),
    cert: await readFile(process.env.ANDON_TEST_TLS_CERT),
  },
  (req, res) => {
    const upstream = request(
      `http://127.0.0.1:4187${req.url}`,
      { method: req.method, headers: req.headers },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  },
);
await new Promise((resolve) => proxy.listen(4188, "127.0.0.1", resolve));

const browser = await chromium.launch({
  executablePath: process.env.ANDON_CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"],
});
const results = [];
const workstationId = "ws_00000000-0000-4000-8000-000000000001";

try {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    await context.addInitScript(({ id }) => {
      localStorage.setItem("andon.workstationId", id);
      sessionStorage.setItem(
        "andonAdminSession",
        JSON.stringify({
          token: "visual-admin-token",
          username: "admin",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      );
    }, { id: workstationId });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const send = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": "https://127.0.0.1:4188",
            "Access-Control-Allow-Credentials": "true",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify(body),
        });
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "https://127.0.0.1:4188",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "content-type,x-andon-workstation-id,x-andon-csrf",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH",
          },
        });
      if (path === "/api/workstations/register")
        return send({
          id: workstationId,
          name: "Notebook de validação",
          active: true,
          pendingApproval: false,
          allowOperational: true,
          allowBi: true,
          allowPriorities: true,
          lockedMachineId: null,
        });
      if (path === "/api/modules/settings") return send({ hubEnabled: true });
      if (path === "/api/access/session")
        return send({
          initialized: true,
          csrf: "visual-csrf",
          principal: {
            userId: "admin",
            login: "admin.central",
            displayName: "Admin Central",
            isPrimaryAdmin: true,
            purpose: "normal",
          },
        });
      if (path === "/api/access/catalog")
        return send({ permissions: [], roles: [], machines: [] });
      if (path === "/api/access/users") return send({ users: [], total: 0 });
      if (path === "/api/access/workstations") return send([]);
      if (path === "/api/modules/credentials") return send([]);
      if (path === "/api/dashboard-priority/access-status")
        return send({ passwordRequired: false, configured: false });
      return send({ error: `Unexpected fixture route: ${path}` }, 500);
    });

    const noOverflow = async () =>
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto("https://127.0.0.1:4188/hub/admin?section=overview");
    await page.getByRole("heading", { name: "Resumo administrativo", exact: true }).waitFor();
    const navigation = page.getByRole("navigation", { name: "Seções administrativas do Hub" });
    assert.equal(await navigation.getByRole("link").count(), 5);
    assert.equal(await page.getByRole("link", { name: "Usuários e Acessos", exact: true }).count(), 1);
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-overview.png`, fullPage: true });

    for (const [label, section] of [
      ["Usuários e Acessos", "users"],
      ["Workstations", "workstations"],
      ["Segurança", "security"],
      ["Módulos e senhas", "modules"],
      ["Visão geral", "overview"],
    ]) {
      const link = navigation.getByRole("link", { name: label, exact: true });
      await link.click();
      await page.waitForURL((url) => url.searchParams.get("section") === section);
      assert.equal(await link.getAttribute("aria-current"), "page");
    }

    await navigation.getByRole("link", { name: "Usuários e Acessos", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("section") === "users");
    await page.reload();
    await page.getByText("Sessão central: Admin Central · admin.central", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("navigation", { name: "Seções administrativas do Hub" })
        .getByRole("link", { name: "Usuários e Acessos", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-users.png`, fullPage: true });

    const language = page.getByRole("combobox").first();
    await language.click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await page.getByRole("link", { name: "Users and Access", exact: true }).waitFor();
    await language.click();
    await page.getByRole("option", { name: "繁體中文", exact: true }).click();
    await page.getByRole("link", { name: "使用者與存取權", exact: true }).waitFor();

    await page.goto("http://127.0.0.1:4187/hub/admin?section=users");
    await page
      .getByText(
        "Gestão de usuários indisponível neste endereço. É necessário configurar acesso HTTPS seguro.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByRole("button", { name: "Tentar novamente", exact: true }).count(), 0);
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-https-required.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ viewport, navigationSections: 5, screenshots: 3, noOverflow: true });
    await context.close();
  }
  await writeFile(
    `${output}/browser-results.json`,
    JSON.stringify({ environment: "Production build with isolated API fixtures", results }, null, 2),
  );
  console.log(`Hub Admin navigation browser PASS: ${results.length} viewports, 6 screenshots.`);
} finally {
  await browser.close();
  await new Promise((resolve) => proxy.close(resolve));
}
