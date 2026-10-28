import assert from "node:assert/strict";
import test from "node:test";
import { inspectTlsCertificate, tlsInventoryFromEnvironment } from "./tlsInventory.js";

const CERT = "-----BEGIN CERTIFICATE-----\nMIIDJjCCAg6gAwIBAgIUEmaf0Jx/RGG8iWqVJWDYW8cuudAwDQYJKoZIhvcNAQEL\nBQAwOzEcMBoGA1UEAwwTYW5kb24udGVzdC5pbnRlcm5hbDEbMBkGA1UECgwSQU5E\nT04gVGVzdCBGaXh0dXJlMB4XDTI2MTAwMTAwMDAwMFoXDTI3MTAwMTAwMDAwMFow\nOzEcMBoGA1UEAwwTYW5kb24udGVzdC5pbnRlcm5hbDEbMBkGA1UECgwSQU5ET04g\nVGVzdCBGaXh0dXJlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnOW1\nKL7Kz7bFcg1oVifpQM8dsD1Gkw0q6fw9BKc5lw0qDwaD1Q9WcX5nLGA/DUL5VN2B\nstoaUpVpj14D83qmsTYn+bEB7v8GS+ydmwl2Owm5D1PVWl/UpSH6G38E1Qm/6tiA\nqdkGztcZkDxyKs/Oy0etQctPfl+9k7zF22P+uqGNCQ/7uXzOG046ZX112W+JdTos\nQPlFAjPdQDZWrMPumCXT/hvCIqCfAxyoky3k17StRaXvUW/3NbQvRPhoCzzATBFV\nUSQGOWFp+haa/4EjZxpsS3gy4LUnaEwzArvslQjt96Hq4J4BvNovZ01m42taN16z\n9fX3GzzVvECyyFPbGwIDAQABoyIwIDAeBgNVHREEFzAVghNhbmRvbi50ZXN0Lmlu\ndGVybmFsMA0GCSqGSIb3DQEBCwUAA4IBAQAZMXeb9bljRtE/ezC1lfVT7D3BR4Da\nHxKfb3Qjd155lScL3fjvyuFDUUvodrkFsUMPXFtBtc1R/A5EL3tr3hKDBE9y10uW\nSUPsZYGjxj4QV8wNwj3WkaaXyDEKa0rPzceOJVuYQUCvlnTzi4cIoSgwRrHv3Jt7\nnFmyYTNidC+IE/t/MQTGY6EMNNUBjgzC35HbMYudBxQRbUfwdCnxAvwDsgPvd0hF\nyzURopFnFdqIDeuM9xdvkfDQj9HM/eKXb5eoZVpDWAWLvkOm9VFyRKyJK7GrNyfj\npMOehpG9rnIJZnXAl6V0x58jKnCEIkc3Btn7bvhAFbIBuEcANS3H447D\n-----END CERTIFICATE-----";

test("TLS inventory checks SAN, expiration and returns public PEM only", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  const result = inspectTlsCertificate(CERT, "andon.test.internal", now);
  assert.equal(result.certificate?.hostMatchesCertificate, true);
  assert.equal(result.certificate?.validity, "valid");
  assert.match(result.certificate?.fingerprint256 ?? "", /^[A-F0-9:]+$/);
  assert.equal(result.publicCertificateChainPem?.includes("BEGIN CERTIFICATE"), true);
  assert.equal(result.publicCertificateChainPem?.includes("PRIVATE KEY"), false);
  assert.equal(inspectTlsCertificate(CERT, "another.test.internal", now).certificate?.hostMatchesCertificate, false);
  assert.equal(inspectTlsCertificate(CERT, "andon.test.internal", new Date("2028-01-01")).certificate?.validity, "expired");
  assert.equal(inspectTlsCertificate(CERT, "andon.test.internal", new Date("2026-09-01")).certificate?.validity, "not_yet_valid");
});

test("TLS inventory fails closed on malformed certificates or missing TLS config", () => {
  assert.throws(() => inspectTlsCertificate("not a PEM", "andon.test.internal"), /tls_certificate_invalid/);
  assert.deepEqual(tlsInventoryFromEnvironment({ ANDON_ACCESS_ORIGIN: "http://127.0.0.1:8080" }), {
    transport: "http",
    canonicalHost: "127.0.0.1",
    certificate: null,
    publicCertificateChainPem: null,
    note: "HTTPS ainda nao configurado neste processo.",
  });
});
