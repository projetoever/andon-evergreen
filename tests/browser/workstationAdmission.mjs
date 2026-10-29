// Production UI rendered over an isolated HTTPS proxy with stateful API fixtures.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { request } from "node:http";

const { chromium } = await import(process.env.ANDON_PLAYWRIGHT_MODULE || "playwright");
const output = process.env.ANDON_EVIDENCE_DIR || "docs/validation/workstation-admission-20261027";
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
  executablePath: process.env.ANDON_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"],
});
const workstationId = "ws_00000000-0000-4000-8000-000000000099";
const adminId = "ws_00000000-0000-4000-8000-000000000001";
const now = "2026-10-27T10:00:00.000Z";
const results = [];

try {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    await context.addInitScript(({ id }) => localStorage.setItem("andon.workstationId", id), {
      id: workstationId,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let principal = null;
    let admission = null;
    let approved = false;
    let administrativeView = false;
    const account = {
      id: "leader-1",
      login: "lider.producao",
      displayName: "Carlos — Liderança de Produção",
      roleLabel: "Líder",
    };
    const station = () => ({
      id: workstationId,
      name: approved ? "Kiosk Linha 1" : null,
      active: approved,
      pendingApproval: !approved,
      allowOperational: false,
      allowBi: approved,
      allowPriorities: false,
      lastIpAddress: "192.168.68.137",
      lockedMachineId: null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      admission,
    });
    const adminStation = {
      ...station(),
      id: adminId,
      name: "Notebook Administração",
      active: true,
      pendingApproval: false,
      allowOperational: true,
      allowBi: true,
      allowPriorities: true,
      admission: null,
      linkedAccount: null,
      authenticatedAccount: {
        id: "admin",
        login: "admin",
        displayName: "Admin",
        roleLabel: "Admin",
      },
      lastLogin: {
        account: { id: "admin", login: "admin", displayName: "Admin", roleLabel: "Admin" },
        createdAt: now,
        lastInteractionAt: now,
        expiresAt: "2026-10-27T22:00:00.000Z",
        purpose: "normal",
        state: "valid",
      },
    };
    const cors = {
      "Access-Control-Allow-Origin": "https://127.0.0.1:4188",
      "Access-Control-Allow-Credentials": "true",
      "Cache-Control": "no-store",
    };
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const send = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers: cors,
          body: JSON.stringify(body),
        });
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            ...cors,
            "Access-Control-Allow-Headers": "content-type,x-andon-workstation-id,x-andon-csrf",
            "Access-Control-Allow-Methods": "GET,POST,PATCH",
          },
        });
      if (path === "/api/workstations/register") return send(station());
      if (path === "/api/modules/access")
        return send({
          hubEnabled: true,
          centralAccessEnabled: true,
          principal: approved && principal?.purpose === "normal" ? principal : null,
          workstation: station(),
          modules: [
            {
              id: "operational",
              name: "ANDON operacional",
              description: "Máquinas, chamados e atendimento em tempo real.",
              route: "/andon",
              icon: "factory",
              available: true,
              enabled: true,
              allowed: false,
              passwordRequired: false,
              authenticated: true,
            },
            {
              id: "bi",
              name: "ANDON BI",
              description: "Indicadores, análises e confiabilidade industrial.",
              route: "/bi",
              icon: "chart",
              available: true,
              enabled: true,
              allowed: approved && principal?.purpose === "normal",
              passwordRequired: false,
              authenticated: true,
            },
            {
              id: "priorities",
              name: "Prioridades de produção",
              description: "Organização da sequência visual das máquinas.",
              route: "/machine-priorities",
              icon: "priority",
              available: true,
              enabled: true,
              allowed: false,
              passwordRequired: false,
              authenticated: false,
            },
          ],
        });
      if (path === "/api/access/session") {
        if (administrativeView)
          principal = {
            userId: "admin",
            login: "admin",
            displayName: "Admin",
            roleLabel: "Admin",
            isPrimaryAdmin: true,
            purpose: "normal",
            permissions: [],
          };
        return send({ principal, csrf: "fixture-csrf", initialized: true });
      }
      if (path === "/api/access/login") {
        principal = {
          ...account,
          userId: account.id,
          isPrimaryAdmin: false,
          purpose: approved ? "normal" : "workstation_admission",
          permissions: ["bi.read"],
        };
        return send({ csrf: "fixture-csrf", purpose: principal.purpose });
      }
      if (path === "/api/access/admission/request") {
        const data = req.postDataJSON();
        admission = {
          status: "pending",
          requestedAt: now,
          requestedName: data.requestedName,
          requestReason: data.reason,
          requestIpAddress: "192.168.68.137",
          decidedAt: null,
          decisionReason: null,
          requester: account,
          decidedBy: null,
        };
        return send({ status: "pending", requestedAt: now });
      }
      if (path === "/api/access/workstations") {
        const pending = {
          ...station(),
          linkedAccount: account,
          authenticatedAccount: null,
          lastLogin: {
            account,
            createdAt: now,
            lastInteractionAt: now,
            expiresAt: "2026-10-27T10:10:00.000Z",
            purpose: "workstation_admission",
            state: "workstation_blocked",
          },
        };
        return send([pending, adminStation]);
      }
      if (path.endsWith("/decision")) {
        const data = req.postDataJSON();
        assert.equal(data.reason, "Kiosk validado para a Linha 1");
        approved = data.decision === "approve";
        return send({ ok: true });
      }
      return send({ error: `unexpected:${req.method()}:${path}` }, 404);
    });

    await page.goto("https://127.0.0.1:4188/hub");
    await page.getByRole("heading", { name: "Identifique-se para acessar o Hub" }).waitFor();
    await page.screenshot({
      path: `${output}/${viewport.width}-identification.png`,
      fullPage: true,
    });
    await page.getByLabel("Usuário").fill("lider.producao");
    await page.getByLabel("Senha").fill("isolated-password");
    await page.getByRole("button", { name: "Identificar" }).click();
    await page.getByLabel("Identificação da workstation").fill("Kiosk Linha 1");
    await page.getByLabel("Finalidade ou localização (opcional)").fill("Produção — Linha 1");
    await page.getByRole("button", { name: "Enviar solicitação" }).click();
    await page.getByRole("heading", { name: "Solicitação aguardando aprovação" }).waitFor();
    assert.equal(await page.getByText("ANDON BI", { exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/${viewport.width}-pending.png`, fullPage: true });

    administrativeView = true;
    // This test focuses on workstation admission, so provision a validated
    // legacy Admin session fixture before opening the newly gated Admin route.
    await page.evaluate(() => {
      sessionStorage.setItem("andonAdminSession", JSON.stringify({
        token: "workstation-test-admin-session",
        username: "admin",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));
    });
    await page.goto("https://127.0.0.1:4188/hub/admin?section=workstations");
    await page.getByRole("button", { name: /Kiosk Linha 1|Workstation não identificada/ }).click();
    // Distinguish historical admission identity from the current authenticated account.
    await page.getByText("Solicitante da admissão", { exact: true }).first().waitFor();
    await page.getByText("Sessão central autenticada", { exact: true }).first().waitFor();
    await page.getByText("Sessão bloqueada pela workstation", { exact: true }).first().waitFor();
    await page.getByText("Sem registro nos últimos 30 min — estado online desconhecido", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("Registro nos últimos 30 min — não confirma conexão ativa", { exact: true }).count(), 0);
    await page.getByLabel("Motivo da decisão").fill("Kiosk validado para a Linha 1");
    const decisionBiSwitch = page.getByRole("switch", { name: /ANDON BI/ }).first();
    assert.equal(await decisionBiSwitch.isEnabled(), true);
    await decisionBiSwitch.click();
    await page.screenshot({
      path: `${output}/${viewport.width}-admin-decision.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Aprovar workstation" }).click();
    approved = true;
    administrativeView = false;
    principal = null;
    await page.goto("https://127.0.0.1:4188/hub");
    await page.getByRole("heading", { name: "Identifique-se para acessar o Hub" }).waitFor();
    await page.getByLabel("Usuário").fill("lider.producao");
    await page.getByLabel("Senha").fill("isolated-password");
    await page.getByRole("button", { name: "Identificar" }).click();
    await page.getByText("ANDON BI", { exact: true }).waitFor();
    assert.equal(await page.getByText("ANDON operacional", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Prioridades de produção", { exact: true }).count(), 0);
    await page.screenshot({
      path: `${output}/${viewport.width}-approved-modules.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert(overflow.scroll <= overflow.width, JSON.stringify(overflow));
    assert.deepEqual(errors, []);
    results.push({ viewport, overflow, screenshots: 4 });
    await context.close();
  }
  await writeFile(`${output}/browser-results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Workstation admission browser PASS: ${results.length} viewports, 8 screenshots.`);
} finally {
  await browser.close();
  await new Promise((resolve) => proxy.close(resolve));
}
