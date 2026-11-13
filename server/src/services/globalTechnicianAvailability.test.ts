import assert from "node:assert/strict";
import test from "node:test";
import { busyTechnicianIdsFromGlobalSessions } from "./globalTechnicianAvailability.js";

const technicians = [
  { id: "vini", name: "Vini" },
  { id: "vitor", name: "vitor" },
  { id: "livre", name: "Livre" },
];

test("P0: admin and restricted production receive the same global busy IDs", () => {
  const sessions = [
    { technicianId: "vini", technicianName: "Vini", callId: "machine15" },
    { technicianId: "vitor", technicianName: "vitor", callId: "machine32" },
  ];
  const actual = busyTechnicianIdsFromGlobalSessions(technicians, sessions, "machine10");
  assert.deepEqual(actual, ["vini", "vitor"]);
  assert.deepEqual(busyTechnicianIdsFromGlobalSessions(technicians, sessions, "machine10"), actual);
});

test("P0: current call is excluded; ended sessions are filtered by the database", () => {
  const sessions = [
    { technicianId: "vini", technicianName: "Vini", callId: "machine10" },
    { technicianId: "vitor", technicianName: "vitor", callId: "machine32" },
  ];
  assert.deepEqual(busyTechnicianIdsFromGlobalSessions(technicians, sessions, "machine10"), ["vitor"]);
  assert.deepEqual(busyTechnicianIdsFromGlobalSessions(technicians, [], "machine10"), []);
});

test("P0: legacy sessions with NULL technicianId block by case-insensitive name", () => {
  const sessions = [
    { technicianId: null, technicianName: "  VITOR ", callId: "machine32" },
    { technicianId: "vini", technicianName: "Wrong historical name", callId: "machine15" },
    { technicianId: "ghost", technicianName: "Livre", callId: "legacy-unknown-id" },
  ];
  assert.deepEqual(busyTechnicianIdsFromGlobalSessions(technicians, sessions, "machine10"), ["vini", "vitor"]);
});

test("P0: no call, machine, or workstation identifiers are included in occupancy results", () => {
  const busy = busyTechnicianIdsFromGlobalSessions(technicians, [
    { technicianId: "vini", technicianName: "Vini", callId: "secret-machine15-call" },
  ], "machine10");
  assert.deepEqual(busy, ["vini"]);
  assert.ok(!JSON.stringify(busy).includes("secret-machine15-call"));
});
