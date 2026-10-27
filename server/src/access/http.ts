import type { FastifyRequest } from "fastify";

export const ACCESS_COOKIE = "__Host-andon-access";
export const PREAUTH_COOKIE = "__Host-andon-preauth";

export function readSecureCookie(request: FastifyRequest, name: string) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${name}=`));
  const value = values.length === 1 ? values[0].slice(name.length + 1) : "";
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}

export function centralAccessEnabled() {
  return process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1";
}
