// Production UI rendered over isolated HTTPS; API fixtures are stateful.
// Real HTTPS cookies, authorization and PostgreSQL are tested separately by validate-access-http.mjs.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { request } from "node:http";
const { chromium } = await import(process.env.ANDON_PLAYWRIGHT_MODULE || "playwright");
const output = "docs/validation/hub-users-20261026";
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
const source = await readFile("server/src/access/policy.ts", "utf8");
const permissions = [...source.split("] as const")[0].matchAll(/"([a-z][a-zA-Z.]+)"/g)].map(
  (m) => m[1],
);
const results = [];
try {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    await context.addInitScript(() => {
      localStorage.setItem("andon.workstationId", "ws_00000000-0000-4000-8000-000000000001");
      // The administrative page now requires a validated legacy Admin session
      // before the independent central-users bootstrap/login is displayed.
      sessionStorage.setItem("andonAdminSession", JSON.stringify({
        token: "users-ui-admin-session",
        username: "admin",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let principal = {
      userId: "admin",
      login: "admin",
      displayName: "Admin",
      isPrimaryAdmin: true,
      purpose: "normal",
    };
    let csrf = "fixture-csrf";
    let initialized = true;
    const seed = (id, name, role, active = true) => ({
      id,
      login: id,
      displayName: name,
      roleLabel: role,
      accountType: "person",
      active,
      isPrimaryAdmin: id === "admin",
      machineScope: id === "admin" ? "all" : "selected",
      mustChangePassword: false,
      authorizationVersion: 1,
      permissions: [{ key: "andon.read" }],
      machines: id === "admin" ? [] : [{ machineId: "37" }],
    });
    let users = [
      seed("admin", "Admin", "Admin"),
      seed("gerente.ana", "Ana — Gerência Industrial", "Gestor/Gerente"),
      seed("lider.carlos", "Carlos — Linha de Produção", "Líder"),
      seed("tecnico.joao", "João — Manutenção", "Manutenção", false),
    ];
    let secret = "";
    const requests = [];
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const data = req.postDataJSON();
      requests.push({ path, method: req.method() });
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
            "Access-Control-Allow-Methods": "GET,POST,PUT",
          },
        });
      if (path === "/api/workstations/register")
        return send({
          id: "ws_00000000-0000-4000-8000-000000000001",
          active: true,
          pendingApproval: false,
        });
      // Admin entry now verifies the Hub policy before rendering; provide
      // the legacy-mode policy in this independent users-screen fixture.
      if (path === "/api/modules/access") return send({
        hubEnabled: true, centralAccessEnabled: false,
        workstation: {
          id: "ws_00000000-0000-4000-8000-000000000001",
          active: true, pendingApproval: false,
          allowOperational: true, allowBi: true, allowPriorities: true,
        },
        modules: [],
      });
      if (path === "/api/access/session") return send({ principal, csrf, initialized });
      if (req.method() !== "GET") assert.equal(req.headers()["x-andon-csrf"], csrf);
      if (path === "/api/access/catalog")
        return send({
          permissions,
          roles: ["Admin", "Gestor/Gerente", "Líder", "Manutenção", "Produção"],
          machines: [
            { id: "37", name: "Máquina 37", isActive: true },
            { id: "38", name: "Máquina 38", isActive: true },
          ],
        });
      if (path === "/api/access/users" && req.method() === "GET") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const filtered = users.filter((u) =>
          `${u.login} ${u.displayName}`.toLowerCase().includes(q),
        );
        return send({ users: filtered, total: filtered.length });
      }
      if (path === "/api/access/users" && req.method() === "POST") {
        if (users.some((u) => u.login === data.login)) return send({ error: "user_conflict" }, 409);
        const u = {
          ...data,
          id: data.login,
          authorizationVersion: 1,
          mustChangePassword: true,
          isPrimaryAdmin: false,
          permissions: data.permissions.map((key) => ({ key })),
          machines: data.machineIds.map((machineId) => ({ machineId })),
        };
        users.push(u);
        secret = "a1b2c3d4e5f678901234";
        return send({ user: u, temporaryPassword: secret });
      }
      if (path.startsWith("/api/access/users/") && req.method() === "PUT") {
        const id = decodeURIComponent(path.split("/").at(-1));
        users = users.map((u) =>
          u.id === id
            ? {
                ...u,
                ...data,
                permissions: data.permissions.map((key) => ({ key })),
                machines: data.machineIds.map((machineId) => ({ machineId })),
                authorizationVersion: u.authorizationVersion + 1,
              }
            : u,
        );
        return send({ user: users.find((u) => u.id === id) });
      }
      if (path === "/api/access/logout") {
        principal = null;
        return send({ ok: true });
      }
      if (path === "/api/access/initialize") {
        assert.equal(data.login, "quality.admin");
        assert.equal(data.currentPassword, "Existing fixture Admin");
        assert.equal(data.newPassword, "A6@rX2p!");
        initialized = true;
        principal = {
          userId: "admin",
          login: data.login,
          displayName: "Admin",
          isPrimaryAdmin: true,
          purpose: "normal",
        };
        return send({ csrf, purpose: "normal" });
      }
      if (path === "/api/access/login") {
        principal = {
          userId: data.login,
          login: data.login,
          displayName: data.login,
          isPrimaryAdmin: false,
          purpose: "password_change",
        };
        return send({ csrf, purpose: principal.purpose });
      }
      if (path === "/api/access/password") {
        principal = { ...principal, purpose: "normal" };
        return send({ csrf, purpose: "normal" });
      }
      if (path === "/api/access/interaction") return send({ ok: true });
      return send({ error: `Unexpected fixture route: ${path}` }, 500);
    });
    const noOverflow = async () =>
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    await page.goto("https://127.0.0.1:4188/hub/admin?section=users");
    await page.getByText("Ana — Gerência Industrial", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Painel de colaboradores", exact: true }).waitFor();
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-list.png`, fullPage: true });
    await page.getByRole("textbox", { name: "Pesquisar usuários" }).fill("Carlos");
    await page.getByText("Página 1 · 1 usuários", { exact: true }).waitFor();
    assert.equal(await page.getByText("Ana — Gerência Industrial", { exact: true }).count(), 0);
    await page.getByRole("textbox", { name: "Pesquisar usuários" }).fill("");
    await page.getByRole("button", { name: "Cadastrar usuário", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Marina — Supervisão de Produção");
    await page.getByLabel("Usuário", { exact: true }).fill("marina.producao");
    await page.getByLabel("Perfil", { exact: true }).selectOption("Líder");
    await page.getByRole("button", { name: "Aplicar permissões sugeridas", exact: true }).click();
    assert.equal(
      await page.getByRole("checkbox", { name: "Prioridades: visualizar", exact: true }).isChecked(),
      true,
    );
    await page.getByRole("checkbox", { name: "Máquina 37 · 37", exact: true }).check();
    await page.getByRole("checkbox", { name: "ANDON: visualizar", exact: true }).check();
    await page.getByRole("checkbox", { name: "Chamados: abrir", exact: true }).check();
    await page.evaluate(() => scrollTo(0, 0));
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-create.png`, fullPage: true });
    await page.getByRole("button", { name: "Salvar usuário", exact: true }).click();
    await page.getByText("Senha provisória — exibição única", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Já anotei, ocultar", exact: true }).click();
    await page.reload();
    await page.getByText("Marina — Supervisão de Produção", { exact: true }).waitFor();
    assert.equal(await page.getByText(secret, { exact: true }).count(), 0);
    const row = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText("Marina — Supervisão de Produção", { exact: true }) });
    // Existing Card does not expose data-slot in all versions; use its containing card.
    const editButton = page
      .getByText("Marina — Supervisão de Produção", { exact: true })
      .locator("xpath=../..")
      .getByRole("button", { name: "Editar", exact: true });
    await editButton.click();
    assert.equal(
      await page.getByRole("button", { name: "Salvar usuário", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("checkbox", { name: "Usuário ativo", exact: true }).uncheck();
    // Wait for the actual mutation response rather than an unchanged list
    // label that can remain visible while the API update is still pending.
    const [savedUser] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith("/api/access/users/") &&
        response.request().method() === "PUT" && response.ok(),
      ),
      page.getByRole("button", { name: "Salvar usuário", exact: true }).click(),
    ]);
    assert.equal((await savedUser.json()).user.active, false);
    await page.getByText("Marina — Supervisão de Produção", { exact: true }).waitFor();
    assert.equal(users.find((u) => u.login === "marina.producao").active, false);
    // Explicit language switching avoids the pre-existing persisted-locale SSR mismatch.
    const chooseLanguage = async (label) => {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: label, exact: true }).click();
    };
    await chooseLanguage("English");
    await page.getByRole("button", { name: "Create user", exact: true }).waitFor();
    await chooseLanguage("繁體中文");
    await page.getByRole("button", { name: "建立使用者", exact: true }).waitFor();
    await chooseLanguage("Português");
    await page.getByRole("button", { name: "Sair desta sessão", exact: true }).click();
    await page.getByLabel("Usuário", { exact: true }).fill("first.user");
    await page.getByLabel("Senha", { exact: true }).fill("provisional-fixture");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      .getByLabel("Nova senha pessoal", { exact: true })
      .fill("Minha senha pessoal de teste");
    await page
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill("Minha senha pessoal de teste");
    await page.getByRole("button", { name: "Salvar senha pessoal", exact: true }).click();
    await page
      .getByText("Primeiro acesso concluído. Sua senha pessoal está definida.", { exact: true })
      .waitFor();
    await noOverflow();
    const storage = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    assert(!storage.includes(secret));
    assert(!storage.includes("provisional-fixture"));
    assert(!storage.includes("Minha senha pessoal"));
    assert(!storage.includes(csrf));

    // Simulate a fresh installation to verify real label/input geometry.
    initialized = false;
    principal = null;
    await page.reload();
    await page.getByRole("heading", { name: "Habilitar gestão de usuários", exact: true }).waitFor();
    await page.getByText("Etapa 1 de 2 · Configuração do administrador", { exact: true }).waitFor();
    await page.getByText("Você criará uma única conta Admin principal central. A senha Admin existente apenas confirma sua identidade e não será alterada. Durante a migração, haverá duas senhas: a antiga para funções legadas e a nova para o login central do Hub, ANDON e BI.",{exact:true}).waitFor();
    await page.getByText(
      "Próxima etapa: abrir o painel de colaboradores para cadastrar usuários, escolher máquinas e definir permissões. O acesso operacional central não será ativado nesta configuração.",
      { exact: true },
    ).waitFor();
    const fields = [
      "Usuário administrador",
      "Senha Admin existente",
      "Nova senha pessoal",
      "Confirmar nova senha",
    ];
    let previousInputBottom = 0;
    for (const name of fields) {
      const labelRect = await page.getByText(name, { exact: true }).boundingBox();
      const fieldRect = await page.getByLabel(name, { exact: true }).boundingBox();
      assert(labelRect && fieldRect, `Missing layout rectangles: ${name}`);
      assert(
        labelRect.y + labelRect.height + 2 <= fieldRect.y,
        `The label overlaps input: ${name}`,
      );
      assert(
        fieldRect.y >= previousInputBottom,
        `The input overlaps previous field: ${name}`,
      );
      previousInputBottom = fieldRect.y + fieldRect.height;
    }
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-admin-initialization.png`, fullPage: true });
    await page.getByLabel("Usuário administrador", { exact: true }).fill("quality.admin");
    await page.getByLabel("Senha Admin existente", { exact: true }).fill("Existing fixture Admin");
    assert.equal(await page.getByLabel("Nova senha pessoal", { exact: true }).getAttribute("minlength"), "8");
    assert.equal(await page.getByLabel("Confirmar nova senha", { exact: true }).getAttribute("minlength"), "8");
    await page.getByText(
      "Use uma senha de 8 a 128 caracteres (recomendamos 12 ou mais). Ela é exclusiva do login central e não altera a senha Admin legada nem as senhas dos módulos.",
      { exact: true },
    ).waitFor();
    await page.getByLabel("Nova senha pessoal", { exact: true }).fill("A6@rX2p!");
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill("A6@rX2p!");
    await page.getByRole("button", { name: "Criar administrador e abrir painel", exact: true }).click();
    await page.getByRole("heading", { name: "Painel de colaboradores", exact: true }).waitFor();
    await page.getByRole("button", { name: "Cadastrar usuário", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      passed: true,
      checks: [
        "list",
        "search",
        "create",
        "explicit scope and permissions",
        "one-time secret",
        "reload persistence (stateful fixture)",
        "edit/no-change disabled",
        "deactivate",
        "first login/password change",
        "PT/EN/ZH",
        "no overflow",
        "no credentials in browser storage",
        "admin first enrollment labels do not overlap inputs",
        "guided administrator setup and visible staff registration panel",
      ],
      requests: requests.length,
    });
    await context.close();
  }
  await writeFile(
    `${output}/browser-results.json`,
    JSON.stringify(
      {
        environment: "Production build over isolated HTTPS; stateful API fixture, not PostgreSQL",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((r) => proxy.close(r));
}
