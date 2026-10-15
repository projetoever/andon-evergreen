import assert from "node:assert/strict";

/** Requires the isolated integration database; never run against the pilot. */
export async function validateBiCausalQuality(request, prisma) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test")
    throw new Error("BI validation requires isolated andon_test");
  const machineId = "bi-causal-quality-machine";
  const prefix = "bi_causal_quality_";
  const start = new Date("2026-09-01T10:00:00Z"),
    end = new Date("2026-09-01T12:00:00Z");
  const at = (minutes) => new Date(start.getTime() + minutes * 60_000);
  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  const query = new URLSearchParams({
    machineId,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  });
  const clean = async () => {
    await prisma.failureDiagnosisAudit.deleteMany({ where: { machineId } });
    await prisma.technicianSession.deleteMany({ where: { machineId } });
    await prisma.callImpactInterval.deleteMany({ where: { machineId } });
    await prisma.failureEvent.deleteMany({ where: { machineId } });
    await prisma.andonCall.deleteMany({ where: { machineId } });
    await prisma.machineProductionEvent.deleteMany({ where: { machineId } });
    await prisma.machine.deleteMany({ where: { id: machineId } });
    await prisma.failureClassification.deleteMany({ where: { value: { startsWith: prefix } } });
  };
  await clean();
  try {
    await prisma.machine.create({
      data: { id: machineId, name: "BI isolated validation", createdAt: at(-60) },
    });
    await prisma.machineProductionEvent.create({
      data: { machineId, productionMode: "scheduled", startedAt: start, endedAt: end },
    });
    const processClass = await request(
      "/api/failure-classifications",
      json("POST", {
        label: "BI process validation",
        value: prefix + "process",
        responsibility: "process",
        analyticsDisposition: "include",
      }),
      201,
    );
    const manualTest = await request(
      "/api/failure-classifications",
      json("POST", {
        label: "BI manual validation",
        value: prefix + "test",
        responsibility: "other",
        analyticsDisposition: "test",
      }),
      201,
    );
    await request(
      `/api/failure-classifications/${processClass.id}`,
      json("PATCH", { responsibility: "invalid" }),
      400,
    );
    await request(
      `/api/failure-classifications/${manualTest.id}`,
      json("PATCH", { analyticsDisposition: "invalid" }),
      400,
    );
    const finishId = prefix + "finish-snapshot";
    await prisma.andonCall.create({
      data: {
        id: finishId,
        machineId,
        category: "production",
        subtype: "quality",
        status: "in_progress",
        criticality: "medium",
        openedAt: new Date(Date.now() - 120_000),
        attendedAt: new Date(Date.now() - 60_000),
      },
    });
    const finished = await request(
      `/api/andon-calls/${finishId}/finish`,
      json("PATCH", {
        failureClassification: processClass.value,
        failureDescription: "Process cause confirmed",
        machineStatus: "running",
      }),
    );
    assert.equal(finished.failureResponsibility, "process");
    assert.equal(finished.analyticsDisposition, "include");
    const rows = [
      { id: "maintenance", domain: "maintenance", disposition: "include", a: 0, b: 30 },
      { id: "process", domain: "process", disposition: "include", a: 40, b: 100 },
      { id: "test", domain: "maintenance", disposition: "test", a: 0, b: 120 },
      { id: "false", domain: "maintenance", disposition: "false_call", a: 0, b: 120 },
      { id: "duplicate", domain: "maintenance", disposition: "duplicate", a: 0, b: 120 },
      { id: "system", domain: "maintenance", disposition: "include", system: true, a: 0, b: 120 },
      {
        id: "legacy-test",
        domain: null,
        disposition: null,
        classification: manualTest.value,
        a: 0,
        b: 120,
      },
    ];
    for (const row of rows) {
      const id = prefix + row.id;
      await prisma.andonCall.create({
        data: {
          id,
          machineId,
          category: "maintenance",
          subtype: "electrical",
          status: "finished",
          criticality: "medium",
          openedAt: at(row.a),
          attendedAt: at(row.a + 5),
          finishedAt: at(row.b),
          attendanceMinutes: 10,
          maintenanceReturnCount: 1,
          failureClassification: row.classification ?? processClass.value,
          failureResponsibility: row.domain,
          analyticsDisposition: row.disposition,
          isSystemTest: row.system ?? false,
        },
      });
      await prisma.failureEvent.create({
        data: {
          id,
          machineId,
          callId: id,
          startedAt: at(row.a),
          endedAt: at(row.b),
          source: "integration",
          classification: row.classification ?? processClass.value,
          failureResponsibility: row.domain,
          analyticsDisposition: row.disposition,
        },
      });
      await prisma.technicianSession.create({
        data: {
          id,
          callId: id,
          machineId,
          technicianName: id,
          phase: "maintenance",
          startedAt: at(row.a + 5),
          endedAt: at(row.a + 15),
        },
      });
    }
    // An orphan with explicit excluded classification is excluded too.
    await prisma.failureEvent.create({
      data: {
        id: prefix + "orphan-test",
        machineId,
        startedAt: start,
        endedAt: end,
        source: "integration",
        classification: manualTest.value,
      },
    });
    const report = await request(`/api/analytics/overview?${query}`);
    assert.equal(report.kpis.callsOpened, 2);
    assert.equal(report.kpis.callsFinished, 2);
    assert.equal(report.kpis.downtimeMinutes, 90);
    assert.equal(report.production.availabilityPercent, 25);
    assert.equal(report.production.plannedMtbfMinutes, 30);
    assert.equal(report.production.resolvedMttrMinutes, 30);
    assert.equal(report.production.resolvedEpisodes, 1);
    assert.equal(report.kpis.maintenanceEligibleFinishedCalls, 1);
    assert.equal(report.responsibility.excludedCalls, 5);
    assert.equal(
      report.responsibility.downtime.find((row) => row.responsibility === "process")
        .downtimeMinutes,
      60,
    );
    const temporal = await request(`/api/analytics/temporal?${query}`);
    assert.equal(temporal.totals.callsOpened, 2);
    assert.equal(temporal.totals.physicalDowntimeMinutes, 90);
    const participation = await request(`/api/analytics/maintenance?${query}`);
    assert.equal(participation.totals.totalPersonMinutes, 20);
    assert.equal(
      participation.responsibility.find((row) => row.responsibility === "process").personMinutes,
      10,
    );
    const reliability = await request(`/api/analytics/reliability?${query}`);
    assert.equal(reliability.assets[0].callsFinished, 2);
    assert.equal(reliability.assets[0].downtimeMinutes, 90);
    const machine = await request(`/api/analytics/machine-360?${query}`);
    assert.equal(machine.kpis.callsFinished, 2);
    assert.equal(machine.kpis.downtimeMinutes, 90);
    const drill = await request(
      `/api/analytics/drilldown?${query}&dimension=machine&value=${machineId}`,
    );
    assert.equal(drill.items.length, 2);
    const failures = await request(`/api/analytics/failure-intelligence?${query}`);
    assert.equal(failures.totals.diagnosedFinishedCalls, 2);
    assert.ok(!JSON.stringify(failures).includes(prefix + "test"));
    // Catalog edits do not rewrite already snapshotted occurrence ownership.
    await request(
      `/api/failure-classifications/${processClass.id}`,
      json("PATCH", { responsibility: "quality", analyticsDisposition: "test" }),
    );
    const after = await request(`/api/analytics/overview?${query}`);
    assert.equal(after.kpis.callsFinished, 2);
    assert.equal(
      after.responsibility.downtime.find((row) => row.responsibility === "process").downtimeMinutes,
      60,
    );
    // Explicit review is audited and changes both call and physical-event snapshots.
    const reviewed = await request(
      `/api/andon-calls/${prefix}process/failure-details`,
      json("PATCH", {
        failureClassification: processClass.value,
        failureDescription: "Audited review",
        pin: "4821",
      }),
    );
    assert.equal(reviewed.failureResponsibility, "quality");
    assert.equal(reviewed.analyticsDisposition, "test");
    const audit = await prisma.failureDiagnosisAudit.findFirst({
      where: { callId: prefix + "process" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(audit.previousResponsibility, "process");
    assert.equal(audit.newResponsibility, "quality");
    assert.equal(audit.previousDisposition, "include");
    assert.equal(audit.newDisposition, "test");
    const afterReview = await request(`/api/analytics/overview?${query}`);
    assert.equal(afterReview.kpis.callsFinished, 1);
    assert.equal(afterReview.kpis.downtimeMinutes, 30);
    // Cancelling a call alone does not erase an independently recorded real stop.
    await prisma.andonCall.create({
      data: {
        id: prefix + "cancelled",
        machineId,
        category: "maintenance",
        status: "cancelled",
        criticality: "medium",
        openedAt: at(105),
        finishedAt: at(115),
        failureResponsibility: "maintenance",
        analyticsDisposition: "include",
      },
    });
    await prisma.failureEvent.create({
      data: {
        id: prefix + "cancelled",
        callId: prefix + "cancelled",
        machineId,
        startedAt: at(105),
        endedAt: at(115),
        source: "integration",
        failureResponsibility: "maintenance",
        analyticsDisposition: "include",
      },
    });
    const cancelled = await request(`/api/analytics/overview?${query}`);
    assert.equal(cancelled.kpis.callsFinished, 1);
    assert.equal(cancelled.kpis.downtimeMinutes, 40);
    console.log("BI causal: exclusions, weighted KPIs, all datasets and immutable snapshots OK");
  } finally {
    await clean();
  }
}
