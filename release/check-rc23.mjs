#!/usr/bin/env node
/**
 * ANDON REFINE23 release-gate evaluator. Read-only and offline by design.
 * A green CI or live /health cannot prove physical operation or permit factory
 * deployment. Never fetches production data or interacts with equipment.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "rc23-acceptance.json");
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const proof = item => Array.isArray(item?.evidence) && item.evidence.length > 0 &&
  item.evidence.every(value => typeof value === "string" && value.length >= 8);
const signed = item => item?.status === "approved" &&
  typeof item.approvedBy === "string" && item.approvedBy.trim().length >= 2 &&
  typeof item.approvedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.approvedAt) &&
  proof(item);
const waiverSigned = waiver => signed(waiver) &&
  typeof waiver.reason === "string" && waiver.reason.trim().length >= 12;

export function evaluateRc23(manifest, { headCommit = null } = {}) {
  const errors = [], labBlockers = [], externalBlockers = [];
  if (manifest?.schemaVersion !== 1) errors.push("schemaVersion inesperada");
  if (!sha(manifest?.candidateCommit)) errors.push("candidateCommit inválido");
  if (!sha(manifest?.installedCommit)) errors.push("installedCommit inválido");
  if (headCommit !== null && (!sha(headCommit) || headCommit !== manifest?.candidateCommit))
    labBlockers.push("A main local não corresponde ao SHA candidato registrado");
  if (manifest?.installedCommit !== manifest?.candidateCommit)
    labBlockers.push("Notebook: SHA instalado/API/frontend ainda não comprovado no SHA candidato");
  if (manifest?.ci?.status !== "passed" || !sha(manifest?.ci?.testedCommit) ||
      manifest?.ci?.treeMatchesMerged !== true || !manifest?.ci?.run)
    labBlockers.push("CI aprovada e árvore idêntica à versão integrada não comprovadas");

  const required = ["RC01","RC02","RC03","RC04","RC05","RC06","RC07","RC08"];
  if (!Array.isArray(manifest?.gates)) errors.push("Matriz de gates ausente");
  const gates = Array.isArray(manifest?.gates) ? manifest.gates : [];
  const unique = new Set();
  const waivers = Array.isArray(manifest?.p1Waivers) ? manifest.p1Waivers : [];
  if (waivers.length !== new Set(waivers.map(w => w.id)).size)
    errors.push("Waiver P1 duplicado");
  for (const gate of gates) {
    if (unique.has(gate.id)) errors.push("Gate duplicado: " + gate.id);
    unique.add(gate.id);
    if (!required.includes(gate.id)) errors.push("Gate desconhecido: " + gate.id);
    if (!["P0","P1"].includes(gate.priority)) errors.push("Prioridade inválida: " + gate.id);
    if (!["implemented","partial","pending"].includes(gate.implementation))
      errors.push("Implementação inválida: " + gate.id);
    if (!["approved","failed","partial","pending"].includes(gate.operator))
      errors.push("Status do operador inválido: " + gate.id);
    const accepted = gate.implementation === "implemented" &&
      gate.operator === "approved" && signed(gate.acceptance);
    if (accepted) continue;
    const waiver = waivers.find(w => w.id === gate.id);
    if (gate.priority === "P1" && waiverSigned(waiver) && gate.operator !== "failed") continue;
    labBlockers.push(gate.id + " " + gate.priority + ": " +
      (gate.operator === "failed" ? "reprovado" : "sem aceite físico comprovado"));
  }
  for (const id of required) if (!unique.has(id)) errors.push("Gate obrigatório ausente: " + id);
  if (manifest?.operatorFinalAcceptance?.status !== "approved" ||
      !signed(manifest.operatorFinalAcceptance))
    labBlockers.push("Termo de aceite final do operador ausente");
  const requiredExternal = ["ti_firewall_ca", "code_ip_publication_license",
    "industrial_deployment_window"];
  const approvals = Array.isArray(manifest?.externalApprovals)
    ? manifest.externalApprovals : [];
  for (const id of requiredExternal) {
    const approval = approvals.find(x => x.id === id);
    if (!signed(approval)) externalBlockers.push(id + ": aprovação externa pendente");
  }
  if (approvals.length !== new Set(approvals.map(x => x.id)).size)
    errors.push("Aprovação externa duplicada");
  // Never authorize RELAT1 via a CI marker or a generic user acceptance.
  const history = gates.find(g => g.id === "RC02");
  const historyAccepted = history?.operator === "approved" && signed(history.acceptance) &&
    history.implementation === "implemented";
  const reportAllowed = historyAccepted && signed(manifest?.reportAuthorization);
  if (!reportAllowed)
    externalBlockers.push("RELAT 1: exige HIST-A–I homologado + autorização separada");

  return {
    valid: errors.length === 0,
    candidateCommit: manifest?.candidateCommit ?? null,
    installedCommit: manifest?.installedCommit ?? null,
    labGo: errors.length === 0 && labBlockers.length === 0,
    industrialCommercialGo: errors.length === 0 && labBlockers.length === 0 &&
      externalBlockers.filter(x => !x.startsWith("RELAT 1:")).length === 0,
    reportAllowed: errors.length === 0 && reportAllowed,
    errors, labBlockers, externalBlockers,
  };
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    process.stderr.write("Manifesto RC indisponível ou inválido.\n");
    process.exitCode = 2;
    return;
  }
  let headCommit = null;
  try {
    headCommit = execFileSync("git", ["rev-parse","HEAD"], {
      cwd: resolve(here, ".."), encoding: "utf8", timeout: 3000,
      stdio: ["ignore","pipe","ignore"],
    }).trim().toLowerCase();
  } catch {
    // Offline checkout without Git is not evidence that HEAD matches.
    headCommit = "UNVERIFIED_LOCAL_HEAD";
  }
  const result = evaluateRc23(manifest, { headCommit });
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write("ANDON RC23 | GO laboratório: " + (result.labGo ? "SIM" : "NÃO") +
      " | GO industrial/comercial: " + (result.industrialCommercialGo ? "SIM" : "NÃO") +
      " | RELAT1 autorizado: " + (result.reportAllowed ? "SIM" : "NÃO") + "\n");
    for (const message of [...result.errors,...result.labBlockers,...result.externalBlockers])
      process.stdout.write(" - " + message + "\n");
    process.stdout.write("Apenas evidências registradas. Não altera serviços, banco ou tarefas.\n");
  }
  if (!result.valid) process.exitCode = 2;
  else if (!result.labGo || !result.industrialCommercialGo) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
