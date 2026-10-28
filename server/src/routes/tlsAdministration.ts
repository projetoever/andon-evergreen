import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { isIP } from "node:net";
import type { FastifyInstance } from "fastify";
import type { TLSSocket } from "node:tls";
import { readAdminSession } from "../security/adminAuthorization.js";
import { centralAccessEnabled } from "../access/http.js";
import { tlsInventoryFromEnvironment } from "../security/tlsInventory.js";

async function configuredDnsDiagnostic(host: string | null) {
  if (!host) return { state: "not_configured", addresses: [] as string[], localMatch: false };
  if (isIP(host)) {
    return { state: "ip_address", addresses: [host], localMatch: false };
  }
  try {
    const entries = await Promise.race([
      lookup(host, { all: true, family: 4 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), 3000)),
    ]);
    const addresses = [...new Set(entries.map((entry) => entry.address))].sort();
    const localIps = new Set(
      Object.values(networkInterfaces())
        .flatMap((entries) => entries ?? [])
        .filter((entry) => entry.family === "IPv4")
        .map((entry) => entry.address),
    );
    return {
      state: addresses.length ? "resolved" : "unresolved",
      addresses,
      localMatch: addresses.some((ip) => localIps.has(ip)),
    };
  } catch {
    return { state: "unresolved", addresses: [] as string[], localMatch: false };
  }
}

/** Read-only TLS inventory. Legacy Admin only until the central identity migration is complete. */
export function registerTlsAdministrationRoutes(app: FastifyInstance) {
  app.get("/api/admin-auth/tls-status", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (centralAccessEnabled()) {
      return reply.status(403).send({ error: "central_admin_integration_pending" });
    }
    if (!readAdminSession(request)) {
      return reply.status(401).send({ error: "admin_auth_required" });
    }
    const expectedOrigin = process.env.ANDON_ACCESS_ORIGIN ?? "";
    if (
      !(request.raw.socket as TLSSocket).encrypted ||
      !expectedOrigin.startsWith("https://")
    ) {
      return reply.status(426).send({ error: "https_required" });
    }
    if (request.headers.origin !== expectedOrigin) {
      return reply.status(403).send({ error: "origin_denied" });
    }
    try {
      const inventory = tlsInventoryFromEnvironment(process.env);
      const dns = await configuredDnsDiagnostic(inventory.canonicalHost);
      return { ...inventory, dns };
    } catch (error) {
      request.log.warn({ error }, "Falha ao inspecionar certificado TLS");
      return reply.status(503).send({ error: "tls_inspection_unavailable" });
    }
  });
}
