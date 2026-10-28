import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedCorsOrigins } from "./cors.js";

test("CORS configurado para HTTPS nao amplia acesso para origens HTTP padrao", () => {
  const previousOrigins = process.env.CORS_ORIGINS;
  try {
    process.env.CORS_ORIGINS = "https://127.0.0.1:8080";
    assert.deepEqual(getAllowedCorsOrigins(), ["https://127.0.0.1:8080"]);
  } finally {
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
  }
});

test("CORS sem configuracao mantem as origens de desenvolvimento legadas", () => {
  const previousOrigins = process.env.CORS_ORIGINS;
  try {
    delete process.env.CORS_ORIGINS;
    assert.ok(getAllowedCorsOrigins().includes("http://127.0.0.1:8080"));
  } finally {
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
  }
});
