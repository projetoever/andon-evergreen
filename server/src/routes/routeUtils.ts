import type { FastifyReply } from "fastify";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parseLimit(value: unknown, defaultLimit = DEFAULT_LIMIT) {
  if (value === undefined) {
    return defaultLimit;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    return defaultLimit;
  }

  return Math.min(limit, MAX_LIMIT);
}

export function parseBoolean(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return undefined;
}

export function parseDate(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export function notFound(reply: FastifyReply, message: string) {
  return reply.status(404).send({
    error: "not_found",
    message,
  });
}

export function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({
    error: "bad_request",
    message,
  });
}
