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
      if (localStorage.getItem("andon.test.skipAdminAutoLogin") === "1") return;
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
    let delayModules = false;
    let centralMode = false;
    let primaryAdmin = true;
    let customerIdentity = { clientName: "Evergreen", clientUnit: "" };
    let paletteWriteEnabled = false;
    let paletteRevision = 0;
    let globalPalette = {
      version: 1, cardBorder: "slate", selectedCardBorder: "evergreen",
      sectorSelection: "evergreen", operationAccent: "evergreen", focusAccent: "evergreen",
    };
    page.on("pageerror", (error) => errors.push(error.message));
    const mockApi = async (route) => {
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
      if (path === "/api/admin-auth/status")
        return send({ username: "admin", passwordConfigured: true,
          recoveryConfigured: false, recoveryCodeIssuedAt: null });
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
      if (path === "/api/system-settings") {
        if (req.method() === "PATCH") {
          const change = req.postDataJSON();
          customerIdentity = { ...customerIdentity, ...change };
        }
        return send({
          ...customerIdentity,
          andonVisualPalette: globalPalette,
          andonVisualPaletteRevision: paletteRevision,
          andonVisualPaletteWriteEnabled: paletteWriteEnabled,
        });
      }
      if (path === "/api/andon-visual-palette") {
        if (req.method() !== "PATCH" || !paletteWriteEnabled)
          return send({ error: "central_action_not_supported" }, 403);
        if (req.headers()["x-andon-csrf"] !== "a".repeat(64))
          return send({ error: "csrf_denied" }, 403);
        const { palette, expectedRevision } = req.postDataJSON();
        if (expectedRevision !== paletteRevision)
          return send({ error: "palette_revision_conflict" }, 409);
        if (palette?.version !== 1 || !["slate","evergreen","ocean","indigo","violet"].includes(palette.cardBorder))
          return send({ error: "invalid_input" }, 400);
        if (JSON.stringify(globalPalette) === JSON.stringify(palette))
          return send({ palette: globalPalette, revision: paletteRevision, changed: false });
        globalPalette = palette;
        paletteRevision += 1;
        return send({ palette: globalPalette, revision: paletteRevision, changed: true });
      }
      if (path === "/api/modules/settings") return send({ hubEnabled: true });
      if (path === "/api/workstations" && req.method() === "GET") {
        const now = new Date();
        return send([
          {id:workstationId,name:"Notebook de validação",active:true,pendingApproval:false,
            lastSeenAt:now.toISOString(),allowOperational:true,allowBi:true,allowPriorities:true},
          {id:"ws_00000000-0000-4000-8000-000000000002",name:null,active:false,pendingApproval:true,
            lastSeenAt:now.toISOString(),allowOperational:false,allowBi:false,allowPriorities:false},
          {id:"ws_00000000-0000-4000-8000-000000000003",name:"Kiosk bloqueado",active:false,pendingApproval:false,
            lastSeenAt:new Date(now.getTime()-86400000).toISOString(),
            allowOperational:false,allowBi:false,allowPriorities:false},
        ]);
      }
      if (path === "/api/modules/access") {
        if (delayModules) await new Promise((resolve) => setTimeout(resolve, 650));
        return send({
          hubEnabled: true,
          centralAccessEnabled: centralMode,
          workstation: {
            id: workstationId,
            name: "Estação de validação",
            active: true,
            allowOperational: true,
            allowBi: true,
            allowPriorities: true,
          },
          modules: [],
        });
      }
      if (path === "/api/admin-auth/login") {
        const { username, password } = req.postDataJSON();
        if (username !== "admin" || password !== "valid-fixture-password")
          return send({ error: "invalid_credentials" }, 401);
        return send({
          token: "validated-admin-token",
          username: "admin",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      }
      if (path === "/api/access/session")
        return send({
          initialized: true,
          csrf: "a".repeat(64),
          principal: {
            userId: "admin",
            login: "admin.central",
            displayName: "Admin Central",
            isPrimaryAdmin: primaryAdmin,
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
    };
    await page.route("**/api/**", mockApi);

    const noOverflow = async () =>
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto("https://127.0.0.1:4188/hub/admin?section=overview");
    await page.getByRole("heading", { name: "Resumo administrativo", exact: true }).waitFor();

    // UX-11: a real browser restores the light theme after reload without
    // changing the factory-dark default or any global system settings.
    const themeButton = page.getByRole("button", { name: "Ativar tema claro" });
    assert.equal(await themeButton.getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
    await themeButton.click();
    await page.waitForFunction(() => document.documentElement.classList.contains("light"));
    assert.equal(await page.evaluate(() => localStorage.getItem("andon.theme.v1")), "light");
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-theme-light.png`, fullPage: true });
    await page.reload();
    await page.getByRole("heading", { name: "Resumo administrativo", exact: true }).waitFor();
    await page.waitForFunction(() => document.documentElement.classList.contains("light"));
    assert.equal(await page.getByRole("button", { name: "Ativar tema escuro" }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Ativar tema escuro" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    assert.equal(await page.evaluate(() => localStorage.getItem("andon.theme.v1")), "dark");

    const customer = page.getByRole("region", { name: "Identificação da empresa e unidade" });
    await customer.getByLabel("Nome da empresa").waitFor();
    assert.equal(await customer.getByLabel("Nome da empresa").inputValue(), "Evergreen");
    await customer.getByLabel("Unidade / planta").fill("Piloto M37");
    await customer.getByRole("button", { name: "Salvar identificação" }).click();
    await customer.getByText("Identificação do cliente salva.").waitFor();
    assert.equal(customerIdentity.clientUnit, "Piloto M37");

    const buildVersion = page.getByRole("region", { name: "Identificação da versão instalada" });
    await buildVersion.waitFor();
    await buildVersion.getByText("Versão do produto", { exact: true }).waitFor();
    await buildVersion.getByText("Commit do frontend compilado", { exact: true }).waitFor();
    const displayedCommit = (await buildVersion.locator("code").innerText()).trim();
    if (/^[a-f0-9]{40}$/.test(displayedCommit)) {
      assert.equal(await buildVersion.getByRole("link", { name: "Ver commit no GitHub" }).getAttribute("href"),
        `https://github.com/projetoever/andon-evergreen/commit/${displayedCommit}`);
      assert.equal(await buildVersion.getByRole("link", { name: "Comparar com a main" }).getAttribute("href"),
        `https://github.com/projetoever/andon-evergreen/compare/${displayedCommit}...main`);
    } else {
      assert.equal(displayedCommit, "Não identificado");
    }
    await page.getByRole("group", {name:"Registradas"}).getByText("3", {exact:true}).waitFor();
    await page.getByRole("group", {name:"Aguardando aprovação"}).getByText("1", {exact:true}).waitFor();
    await page.getByRole("group", {name:"Bloqueadas"}).getByText("1", {exact:true}).waitFor();
    await page.getByRole("group", {name:"Vistas nos últimos 30 min"}).getByText("2", {exact:true}).waitFor();
    await page.getByText("1 estação(ões) sem nome cadastrado.",{exact:true}).waitFor();
    assert.equal(await page.getByText("“Vistas nos últimos 30 min” considera apenas o último registro no servidor. Não confirma que a tela ANDON ou o kiosk estejam abertos.",{exact:true}).count(),1);
    await page.getByRole("button",{name:"Atualizar resumo"}).click();
    await page.getByRole("group",{name:"Registradas"}).getByText("3",{exact:true}).waitFor();
    const navigation = page.getByRole("navigation", { name: "Seções administrativas do Hub" });
    assert.equal(await navigation.getByRole("link").count(), 5);
    assert.equal(await page.getByRole("link", { name: "Usuários e Acessos", exact: true }).count(), 1);
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-overview.png`, fullPage: true });
    assert.equal(await page.getByRole("link",{name:"Gerenciar workstations",exact:true}).getAttribute("href"),
      "/hub/admin?section=workstations");

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

    await navigation.getByRole("link",{name:"Segurança",exact:true}).click();
    await page.getByText("Admin legado e Admin central são contas distintas",{exact:true}).waitFor();
    await navigation.getByRole("link",{name:"Visão geral",exact:true}).click();
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
        "Não foi possível verificar as permissões administrativas.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByRole("button", { name: "Tentar novamente", exact: true }).count(), 0);
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-https-required.png`, fullPage: true });

    // Fresh Hub session: settings opens sign-in here, before navigating to Admin.
    delayModules = true;
    await page.goto("https://127.0.0.1:4188/hub");
    const loadingModules = page.locator('section[role="status"][aria-label]');
    await loadingModules.waitFor();
    assert.equal(await page.getByText("Nenhum módulo liberado para esta workstation. Solicite a liberação ao administrador do Hub.",{exact:true}).count(),0,
      "a slow API response must not briefly display a false no-modules state");
    await loadingModules.waitFor({state:"hidden"});
    delayModules = false;
    // Previous tests deliberately end in Chinese; reset locale before matching
    // the Portuguese Hub login labels in this independent scenario.
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Português", exact: true }).click();
    await page.evaluate(() => {
      localStorage.setItem("andon.test.skipAdminAutoLogin", "1");
      sessionStorage.removeItem("andonAdminSession");
    });
    await page.reload();
    await page.getByRole("button", { name: "Administração do Hub", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Acesso administrativo" });
    await login.waitFor();
    assert.equal(new URL(page.url()).pathname, "/hub");
    assert.equal(await page.getByRole("navigation", { name: "Seções administrativas do Hub" }).count(), 0);
    await login.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/hub");

    await page.getByRole("button", { name: "Administração do Hub", exact: true }).click();
    await login.getByLabel("Senha", { exact: true }).fill("wrong-password");
    await login.getByRole("button", { name: "Entrar", exact: true }).click();
    await login.getByText("Usuário ou senha inválidos.", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/hub");
    await login.getByLabel("Senha", { exact: true }).fill("valid-fixture-password");
    await login.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/hub/admin");
    await page.getByRole("navigation", { name: "Seções administrativas do Hub" }).waitFor();
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-admin-after-login.png`, fullPage: true });

    // Expired/missing session on direct route must not show the Admin UI.
    await page.evaluate(() => sessionStorage.removeItem("andonAdminSession"));
    await page.goto("https://127.0.0.1:4188/hub/admin?section=security");
    await page.getByRole("dialog", { name: "Acesso administrativo" }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Seções administrativas do Hub" }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "Administração do Hub", exact: true }).count(), 0);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/hub");
    await noOverflow();

    // Central mode uses server-owned cookie identity, not the legacy Admin
    // session. Direct URL, limited tabs and role revocation are exercised.
    centralMode = true;
    await page.goto("https://127.0.0.1:4188/hub/admin?section=overview");
    const centralNav = page.getByRole("navigation", { name: "Seções administrativas do Hub" });
    await centralNav.waitFor();
    assert.equal(await centralNav.getByRole("link").count(), 4);
    assert.equal(await centralNav.getByRole("link", { name: "Configurações do ANDON" }).count(), 1);
    await page.getByRole("region", { name: "Identificação da versão instalada" }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Acesso administrativo" }).count(), 0);
    await noOverflow();
    await page.screenshot({ path: `${output}/${viewport.width}-central-overview.png`, fullPage: true });

    // The central-only ANDON area is visible only after server validation.
    // It may display a blocked settings write while its backend flag is OFF.
    await page.goto("https://127.0.0.1:4188/hub/admin?section=andon");
    await page.getByRole("heading", { name: "Configurações operacionais do ANDON" }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Acesso administrativo" }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Sons do ANDON" }).count(), 0);
    // UX-12: the global save must fail closed until a server-side flag allows it.
    let appearance = page.getByRole("region", { name: "Aparência e cores" });
    await appearance.waitFor();
    assert.equal(await appearance.getByRole("button", { name: "Salvar globalmente" }).isDisabled(), true);
    paletteWriteEnabled = true;
    await page.reload();
    appearance = page.getByRole("region", { name: "Aparência e cores" });
    await appearance.getByRole("button", { name: "Salvar globalmente" }).waitFor();
    const cardBorder = appearance.getByRole("combobox", { name: "Contorno padrão dos cards" });
    await cardBorder.selectOption("ocean");
    await appearance.getByRole("button", { name: "Salvar globalmente" }).click();
    await appearance.getByText("Paleta global autorizada para esta sessão. Revisão 1.").waitFor();
    assert.equal(paletteRevision, 1);
    assert.equal(globalPalette.cardBorder, "ocean");
    await appearance.getByRole("button", { name: "Restaurar padrão global" }).click();
    await appearance.getByRole("button", { name: "Confirmar restauração global" }).click();
    await appearance.getByText("Paleta global autorizada para esta sessão. Revisão 2.").waitFor();
    assert.equal(paletteRevision, 2);
    assert.equal(globalPalette.cardBorder, "slate");
    // A competing Admin update must return 409 and prevent silent overwrite.
    paletteRevision += 1;
    globalPalette = { ...globalPalette, cardBorder: "violet" };
    await cardBorder.selectOption("indigo");
    await appearance.getByRole("button", { name: "Salvar globalmente" }).click();
    await appearance.getByText("A paleta foi modificada por outro administrador. Recarregue antes de salvar.").waitFor();
    assert.equal(await appearance.getByRole("button", { name: "Salvar globalmente" }).isDisabled(), true);
    await appearance.getByRole("button", { name: "Recarregar paleta" }).click();
    await page.waitForFunction(() => !!document.querySelector('select[aria-label="Contorno padrão dos cards"][value="violet"]') ||
      Array.from(document.querySelectorAll('select')).some(s => s.getAttribute("aria-label") === "Contorno padrão dos cards" && s.value === "violet"));
    assert.equal(await cardBorder.inputValue(), "violet");
    paletteWriteEnabled = false;
    // UX-12 acceptance: two independent browser contexts with different
    // local visual preferences still receive the SAME revisioned global palette.
    // Both contexts use the same server mock, not a shared browser storage.
    const otherContext = await browser.newContext({
      viewport: { width: 1024, height: 768 }, ignoreHTTPSErrors: true,
    });
    await otherContext.addInitScript(({ id }) => {
      localStorage.setItem("andon.workstationId", id);
      localStorage.setItem("andon.theme.v1", "light");
      localStorage.setItem("andon.dashboardAttention.v1", "highlighted");
    }, { id: "ws_00000000-0000-4000-8000-000000000022" });
    const otherPage = await otherContext.newPage();
    await otherPage.route("**/api/**", mockApi);
    await otherPage.goto("https://127.0.0.1:4188/hub/admin?section=overview");
    await otherPage.waitForFunction(() => (
      document.documentElement.classList.contains("light") &&
      document.documentElement.style.getPropertyValue("--andon-palette-card-border") === "#7837A6"
    ), { timeout: 10000 });
    // Trigger read refresh on the original device, without transferring
    // its independently chosen theme or alert-intensity preference.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const expectedDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    assert.equal(expectedDark, true, "first terminal's theme remains dark");
    await page.waitForFunction(() =>
      document.documentElement.style.getPropertyValue("--andon-palette-card-border") === "#C69BF5");
    assert.equal(await otherPage.evaluate(() => localStorage.getItem("andon.theme.v1")), "light");
    assert.equal(await otherPage.evaluate(() => localStorage.getItem("andon.dashboardAttention.v1")), "highlighted");
    assert.notEqual(await page.evaluate(() => localStorage.getItem("andon.dashboardAttention.v1")), "highlighted");
    // Updating the same global palette will be picked up when the second
    // workstation becomes active, without changing either local preference.
    paletteRevision += 1;
    globalPalette = { ...globalPalette, cardBorder: "ocean" };
    await otherPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await otherPage.waitForFunction(() =>
      document.documentElement.style.getPropertyValue("--andon-palette-card-border") === "#12668F");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() =>
      document.documentElement.style.getPropertyValue("--andon-palette-card-border") === "#55B6EF");
    await otherContext.close();
    await noOverflow();

    await page.goto("https://127.0.0.1:4188/hub/admin?section=security");
    await page.getByText(
      "Configuração indisponível na administração central enquanto as operações sensíveis não estiverem migradas.",
      { exact: true },
    ).waitFor();
    assert.equal(await page.getByRole("link", { name: "Módulos e senhas" }).count(), 0);
    primaryAdmin = false;
    await page.reload();
    await page.getByRole("heading", { name: "Acesso administrativo restrito" }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Seções administrativas do Hub" }).count(), 0);
    await noOverflow();

    assert.deepEqual(errors, []);
    results.push({ viewport, navigationSections: 5, centralSections: 4, screenshots: 5, noOverflow: true, modalFirst: true });
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
