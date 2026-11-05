import assert from "node:assert/strict";
import test from "node:test";
import {
  centralWorkstationApprovalRequired,
  isolatedNotebookHmlAutoAdmissionEnabled,
} from "./centralWorkstationAdmissionPolicy.js";

const keys = [
  "ANDON_HML_OPEN_NEW_WORKSTATIONS_DEFAULT", "ANDON_HOMOLOGATION_HOST",
  "ANDON_HOMOLOGATION_FRONTEND_PORT", "ANDON_ACCESS_ORIGIN", "DATABASE_URL",
] as const;

test("R9.2: central workstation policy defaults closed outside verified isolated notebook", () => {
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(isolatedNotebookHmlAutoAdmissionEnabled(), false);
    assert.equal(centralWorkstationApprovalRequired(undefined), true);
    assert.equal(centralWorkstationApprovalRequired(null), true);
    assert.equal(centralWorkstationApprovalRequired(false), false);
    assert.equal(centralWorkstationApprovalRequired(true), true);

    process.env.ANDON_HML_OPEN_NEW_WORKSTATIONS_DEFAULT = "1";
    process.env.ANDON_HOMOLOGATION_HOST = "127.0.0.1";
    process.env.ANDON_HOMOLOGATION_FRONTEND_PORT = "8080";
    process.env.ANDON_ACCESS_ORIGIN = "https://localhost:8080";
    process.env.DATABASE_URL =
      "postgresql://andon_hml:test@127.0.0.1:55432/andon_https_hml?schema=public";
    assert.equal(isolatedNotebookHmlAutoAdmissionEnabled(), true);
    assert.equal(centralWorkstationApprovalRequired(null), false);
    assert.equal(centralWorkstationApprovalRequired(true), true);
    assert.equal(centralWorkstationApprovalRequired(false), false);

    for (const wrong of [
      "postgresql://andon_hml:test@127.0.0.1:5432/andon_https_hml",
      "postgresql://andon_hml:test@127.0.0.1:55432/andon_db",
      "postgresql://andon_hml:test@192.168.1.30:55432/andon_https_hml",
      "postgresql://andon_hml:test@127.0.0.1:55432/andon_https_hml_extra",
    ]) {
      process.env.DATABASE_URL = wrong;
      assert.equal(isolatedNotebookHmlAutoAdmissionEnabled(), false);
      assert.equal(centralWorkstationApprovalRequired(null), true);
    }

    process.env.DATABASE_URL =
      "postgresql://andon_hml:test@127.0.0.1:55432/andon_https_hml";
    process.env.ANDON_ACCESS_ORIGIN = "https://evergreen.fabrica:8080";
    assert.equal(isolatedNotebookHmlAutoAdmissionEnabled(), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
