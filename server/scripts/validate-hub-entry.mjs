import assert from "node:assert/strict";

/** Runs only inside validate-pr-flow's explicitly isolated andon_test database. */
export async function validateHubEntry({ request, json, prisma, ids, adminAuthorization }) {
  if (
    process.env.ANDON_INTEGRATION_TEST !== "1" ||
    new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
  )
    throw new Error("Use somente o banco isolado andon_test.");
  const previous = await prisma.moduleCredential.findMany();
  const previousPriority = await prisma.dashboardPriorityConfig.findUnique({
    where: { id: "global" },
  });
  const headers = {
    origin: "http://localhost:8080",
    "x-andon-workstation-id": ids.workstation,
    authorization: "",
  };
  const admin = { ...headers, authorization: adminAuthorization };
  try {
    await request("/api/workstations/register", json("POST", { id: ids.workstationB }));
    for (const module of ["operational", "bi"]) {
      const path = module === "bi" ? "/api/analytics/filter-options" : "/api/machines";
      const tokenHeader = module === "bi" ? "x-andon-bi-token" : "x-andon-operational-token";
      const username = `test-${module}`;
      const settings = { username, password: "module-test-password", passwordRequired: true };
      await request(
        `/api/modules/${module}/credentials`,
        { ...json("PUT", settings), headers },
        401,
      );
      await request(
        `/api/modules/${module}/credentials`,
        { ...json("PUT", { username, passwordRequired: true }), headers: admin },
        400,
      );
      const saved = await request(`/api/modules/${module}/credentials`, {
        ...json("PUT", settings),
        headers: admin,
      });
      assert.equal(saved.passwordHash, undefined);
      assert.equal(saved.configured, true);
      assert.match(
        (await prisma.moduleCredential.findUniqueOrThrow({ where: { id: module } })).passwordHash,
        /^scrypt\$/,
      );
      await request(path, { headers }, 401);
      await request(path, { headers: { authorization: adminAuthorization } }, 401);
      await request(
        `/api/modules/${module}/login`,
        { ...json("POST", { username, password: "wrong-password" }), headers },
        401,
      );
      const session = await request(`/api/modules/${module}/login`, {
        ...json("POST", settings),
        headers,
      });
      const authenticated = { ...headers, [tokenHeader]: session.token };
      await request(path, { headers: authenticated });
      const access = await request("/api/modules/access", { headers: authenticated });
      assert.equal(access.modules.find((item) => item.id === module).authenticated, true);
      await request(
        path,
        { headers: { ...authenticated, "x-andon-workstation-id": ids.workstationB } },
        401,
      );
      const permission = module === "bi" ? "allowBi" : "allowOperational";
      await request(`/api/workstations/${ids.workstation}`, json("PATCH", { [permission]: false }));
      await request(path, { headers: authenticated }, 403);
      await request(`/api/modules/${module}/login`, { ...json("POST", settings), headers }, 403);
      await request(`/api/workstations/${ids.workstation}`, json("PATCH", { [permission]: true }));
      await request(`/api/modules/${module}/credentials`, {
        ...json("PUT", { ...settings, password: "replacement-password" }),
        headers: admin,
      });
      await request(path, { headers: authenticated }, 401);
      await request(`/api/modules/${module}/login`, { ...json("POST", settings), headers }, 401);
      const replacement = await request(`/api/modules/${module}/login`, {
        ...json("POST", { username, password: "replacement-password" }),
        headers,
      });
      const replacementHeaders = { ...headers, [tokenHeader]: replacement.token };
      await request(`/api/modules/${module}/logout`, {
        ...json("POST", {}),
        headers: replacementHeaders,
      });
      await request(path, { headers: replacementHeaders }, 401);
      await request(`/api/modules/${module}/credentials`, {
        ...json("PUT", { username, passwordRequired: false }),
        headers: admin,
      });
      await request(path, { headers });
    }
    await request(
      "/api/dashboard-priority/access-policy",
      { ...json("PATCH", { passwordRequired: false }), headers },
      401,
    );
    await request("/api/dashboard-priority/access-policy", {
      ...json("PATCH", { passwordRequired: false }),
      headers: admin,
    });
    const order = await request("/api/dashboard-priority/order", { headers });
    const saved = await request("/api/dashboard-priority/order", {
      ...json("PUT", { machineIds: order.machines.map((item) => item.id) }),
      headers,
    });
    assert.equal(saved.lastOrderUpdatedBy, `workstation:${ids.workstation}`);
    await request("/api/dashboard-priority/order", { headers: { authorization: "" } }, 403);
    await request(
      `/api/workstations/${ids.workstation}`,
      json("PATCH", { allowPriorities: false }),
    );
    await request("/api/dashboard-priority/order", { headers }, 403);
    await request(`/api/workstations/${ids.workstation}`, json("PATCH", { allowPriorities: true }));
    if (!previousPriority?.managerPasswordHash)
      await request(
        "/api/dashboard-priority/access-policy",
        { ...json("PATCH", { passwordRequired: true }), headers: admin },
        400,
      );
    const preflight = await fetch(
      `${process.env.ANDON_API_URL ?? "http://127.0.0.1:3001"}/api/machines`,
      {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8080",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-andon-operational-token,x-andon-bi-token",
        },
      },
    );
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /x-andon-operational-token/i,
    );
    assert.match(preflight.headers.get("access-control-allow-headers"), /x-andon-bi-token/i);
  } finally {
    await prisma.moduleCredential.deleteMany();
    if (previous.length) await prisma.moduleCredential.createMany({ data: previous });
    if (previousPriority)
      await prisma.dashboardPriorityConfig.update({
        where: { id: "global" },
        data: {
          passwordRequired: previousPriority.passwordRequired,
          lastOrderUpdatedAt: previousPriority.lastOrderUpdatedAt,
          lastOrderUpdatedBy: previousPriority.lastOrderUpdatedBy,
        },
      });
    else await prisma.dashboardPriorityConfig.deleteMany({ where: { id: "global" } });
  }
}
