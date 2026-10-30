import assert from "node:assert/strict";

/** Called only from validate-pr-flow's isolated andon_test database harness. */
export async function validateAttendanceIntegrity(request, prisma) {
  const a = "ws_00000000-0000-4000-8000-000000000101",
    b = "ws_00000000-0000-4000-8000-000000000102",
    c = "ws_00000000-0000-4000-8000-000000000103";
  const machineId = "ci-attendance-integrity",
    shiftId = "ci-attendance-integrity-shift";
  let technicianId;
  const json = (method, body, id = a) => ({
    method,
    headers: { "x-andon-workstation-id": id },
    body: JSON.stringify(body),
  });
  const headers = (id = a) => ({ headers: { "x-andon-workstation-id": id } });
  const original = await request("/api/system-settings");
  try {
    await request("/api/modules/settings", {
      method: "PATCH",
      body: JSON.stringify({ requireWorkstationApproval: false }),
    });
    await request("/api/workstations/register", json("POST", { id: a }));
    await request("/api/modules/settings", json("PATCH", { requireWorkstationApproval: true }));
    const pending = await request("/api/workstations/register", json("POST", { id: b }, b));
    assert.equal(pending.pendingApproval, true);
    assert.equal(pending.active, false);
    const access = await request("/api/modules/access", headers(b));
    assert.ok(access.modules.every((module) => !module.allowed));
    await request("/api/machines", headers(b), 403);
    await request("/api/machines", {}, 403);
    const heartbeat = await request("/api/workstations/register", json("POST", { id: b }, b));
    assert.equal(heartbeat.active, false);
    const approved = await request(
      `/api/workstations/${b}`,
      json("PATCH", { active: true, allowBi: false }),
    );
    assert.equal(approved.pendingApproval, false);
    assert.equal(approved.active, true);
    await request("/api/machines", headers(b));
    await request("/api/analytics/filter-options", headers(b), 403);
    const third = await request("/api/workstations/register", json("POST", { id: c }, c));
    assert.equal(third.active, false);
    await request("/api/modules/settings", json("PATCH", { requireWorkstationApproval: false }));
    const stillPending = await request("/api/workstations/register", json("POST", { id: c }, c));
    assert.equal(stillPending.active, false);
    await request("/api/machines");
    assert.equal(
      (await request("/api/workstations/register", json("POST", { id: a }))).active,
      true,
    );

    await request(
      "/api/system-settings",
      json("PATCH", {
        attendanceMode: "pin",
        restrictMaintenanceCompletionToAttendanceWorkstation: true,
      }),
    );
    await prisma.shift.create({
      data: {
        id: shiftId,
        name: "Integridade CI",
        startTime: "06:00",
        endTime: "14:00",
        active: true,
      },
    });
    const tech = await request(
      "/api/technicians",
      json("POST", {
        name: "Técnico integridade CI",
        employeeId: "CI-INTEGRITY",
        technicalArea: "mechanical",
        technicalAreas: ["mechanical"],
        shiftId,
        active: true,
        pin: "90837261",
      }),
      201,
    );
    technicianId = tech.id;
    await request(
      "/api/machines",
      json("POST", { id: machineId, name: "Integridade CI", productionMode: "scheduled" }),
      201,
    );
    const call = await request(
      "/api/andon-calls",
      json("POST", {
        machineId,
        category: "maintenance",
        subtype: "mechanical",
        machineCondition: "running",
        workOrderNumber: "CI-INTEGRITY",
      }),
      201,
    );
    const attended = await request(
      `/api/andon-calls/${call.id}/attend`,
      json("PATCH", { credentials: [{ method: "pin", value: "90837261" }] }),
    );
    assert.equal(attended.technicianSessions[0].workstationId, a);
    const lastTechnicianAttempt = await request(
      `/api/andon-calls/${call.id}/technicians/end`,
      json("PATCH", {
        credential: { method: "pin", value: "90837261" },
        reason: "support_finished",
      }),
      400,
    );
    assert.match(lastTechnicianAttempt.message, /último mantenedor/);
    const stillAttending = await prisma.andonCall.findUniqueOrThrow({
      where: { id: call.id }, include: { technicianSessions: true },
    });
    assert.equal(stillAttending.status, "in_progress");
    assert.equal(stillAttending.technicianSessions.filter(s => !s.endedAt).length, 1,
      "rejected individual end must not orphan the call or change session timestamps");
    await request(`/api/andon-calls/${call.id}/finish-maintenance`, json("PATCH", {}, b), 400);
    const completed = await request(
      `/api/andon-calls/${call.id}/finish-maintenance`,
      json("PATCH", {}),
    );
    assert.equal(completed.status, "post_maintenance");
    const saved = await prisma.andonCall.findUniqueOrThrow({
      where: { id: call.id },
      include: { technicianSessions: true },
    });
    assert.equal(saved.failureClassification, null);
    assert.equal(saved.failureDescription, null);
    assert.ok(saved.technicianSessions.every((s) => s.workstationId === a));
    console.log("Aprovação, permissões e conclusão com último técnico protegido: OK");
  } finally {
    await request("/api/modules/settings", json("PATCH", { requireWorkstationApproval: false }));
    await request(
      "/api/system-settings",
      json("PATCH", {
        attendanceMode: original.attendanceMode,
        restrictMaintenanceCompletionToAttendanceWorkstation:
          original.restrictMaintenanceCompletionToAttendanceWorkstation,
      }),
    );
    const calls = await prisma.andonCall.findMany({ where: { machineId }, select: { id: true } });
    const ids = calls.map((call) => call.id);
    await prisma.machine.updateMany({ where: { id: machineId }, data: { currentCallId: null } });
    await prisma.technicianTimeAllocation.deleteMany({ where: { callId: { in: ids } } });
    await prisma.technicianSession.deleteMany({ where: { callId: { in: ids } } });
    await prisma.failureEvent.deleteMany({ where: { machineId } });
    await prisma.andonCall.deleteMany({ where: { machineId } });
    await prisma.machineProductionEvent.deleteMany({ where: { machineId } });
    await prisma.machinePriorityHistory.deleteMany({ where: { machineId } });
    await prisma.machine.deleteMany({ where: { id: machineId } });
    if (technicianId) await prisma.technician.deleteMany({ where: { id: technicianId } });
    await prisma.shift.deleteMany({ where: { id: shiftId } });
    await prisma.workstation.deleteMany({ where: { id: { in: [a, b, c] } } });
  }
}
