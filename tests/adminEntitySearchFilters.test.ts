import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMachinesForAdmin,
  filterTechniciansForAdmin,
  normalizeAdminSearchValue,
} from "../src/utils/adminEntityFilterUtils";
import type { Machine } from "../src/types/machine";
import type { TechnicianConfig } from "../src/types/settings";

const technicians: TechnicianConfig[] = [
  {
    id: "tech-1",
    employeeId: "12345",
    name: "João da Silva",
    area: "electrical",
    areas: ["electrical", "mechanical"],
    shiftId: "morning",
    active: true,
    hasPin: true,
    hasTag: false,
  },
  {
    id: "tech-2",
    employeeId: "98765",
    name: "Márcia Souza",
    area: "mechanical",
    areas: ["mechanical"],
    shiftId: "afternoon",
    active: false,
    hasPin: true,
    hasTag: true,
  },
];

const machines = [
  { id: "9", name: "Envasadora Principal" },
  { id: "10", name: "Coleiro São Paulo" },
] as Machine[];

test("normalização ignora maiúsculas e acentos", () => {
  assert.equal(normalizeAdminSearchValue("  MÁRCIA  "), "marcia");
});

test("busca de mantenedores encontra por nome ou ID", () => {
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "joao", "all").map((item) => item.id),
    ["tech-1"],
  );
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "987", "all").map((item) => item.id),
    ["tech-2"],
  );
});

test("filtro de setor considera múltiplas áreas técnicas", () => {
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "", "electrical").map((item) => item.id),
    ["tech-1"],
  );
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "", "mechanical").map((item) => item.id),
    ["tech-1", "tech-2"],
  );
});

test("busca e setor combinam simultaneamente", () => {
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "marcia", "electrical").map((item) => item.id),
    [],
  );
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "marcia", "mechanical").map((item) => item.id),
    ["tech-2"],
  );
});

test("busca de máquinas encontra por ID ou nome e ignora acentos", () => {
  assert.deepEqual(
    filterMachinesForAdmin(machines, "10").map((item) => item.id),
    ["10"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(machines, "sao paulo").map((item) => item.id),
    ["10"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(machines, "envasadora").map((item) => item.id),
    ["9"],
  );
});


test("filtros de status e turno de mantenedores combinam com busca e setor", () => {
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "", "all", "active", "all").map(
      (item) => item.id,
    ),
    ["tech-1"],
  );
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "", "all", "inactive", "afternoon").map(
      (item) => item.id,
    ),
    ["tech-2"],
  );
  assert.deepEqual(
    filterTechniciansForAdmin(technicians, "marcia", "mechanical", "active", "all").map(
      (item) => item.id,
    ),
    [],
  );
});


test("filtros de máquinas combinam status e regra efetiva de OS", () => {
  const catalog = [
    {
      id: "9",
      name: "Máquina 9",
      isActive: true,
      requireWorkOrderAtOpen: true,
    },
    {
      id: "10",
      name: "Máquina 10",
      isActive: false,
      requireWorkOrderAtOpen: false,
    },
  ] as Machine[];

  assert.deepEqual(
    filterMachinesForAdmin(catalog, "", "active", "all", false).map((item) => item.id),
    ["9"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(catalog, "", "all", "required", false).map((item) => item.id),
    ["9"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(catalog, "", "all", "optional", false).map((item) => item.id),
    ["10"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(catalog, "", "all", "required", true).map((item) => item.id),
    ["9", "10"],
  );
  assert.deepEqual(
    filterMachinesForAdmin(catalog, "", "all", "optional", true).map((item) => item.id),
    [],
  );
});
