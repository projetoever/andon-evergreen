import assert from "node:assert/strict";
import test from "node:test";
import { buildBiTopicDetail, type BiDetailTopic } from "../src/utils/biTopicDetails";
import { biTopicFixture } from "./fixtures/biTopicFixture";

const topics: BiDetailTopic[] = [
  "availability",
  "mtbf",
  "mtta",
  "mttr",
  "downtime",
  "return-rate",
  "calendar-interval",
  "physical-episodes",
  "avg-downtime",
  "avg-call",
  "finished-calls",
  "classification-coverage",
  "availability-daily",
  "downtime-daily",
  "machines",
  "classifications",
  "sectors",
];
const labels = new Map([
  ["sensor", "Manutenção {0}"],
  ["process", "Falha de processo"],
]);
const sectors = new Map([["mechanical", "Mecânica"]]);

test("expansion preserves API values and keeps restoration separate from technical time", () => {
  const overview = biTopicFixture();
  assert.equal(overview.production?.resolvedMttrMinutes, 60);
  assert.equal(overview.kpis.avgMaintenanceMinutes, 40);
  assert.equal(buildBiTopicDetail("mttr", overview, labels, sectors).value, "60 min");
  assert.equal(buildBiTopicDetail("downtime", overview, labels, sectors).value, "90 min");
  // A deliberately different API value must never be recalculated by the modal.
  overview.production!.resolvedMttrMinutes = 17.25;
  assert.equal(buildBiTopicDetail("mttr", overview, labels, sectors).value, "17,25 min");
});

test("unavailable is distinct from zero and filtered schedules remain explicit", () => {
  const overview = biTopicFixture();
  overview.production!.availabilityPercent = null;
  overview.production!.availabilityStatus = "dimension_filtered";
  const detail = buildBiTopicDetail("availability", overview, labels, sectors);
  assert.equal(detail.value, "—");
  assert.match(detail.notice!, /filtro/);
  overview.kpis.downtimeMinutes = 0;
  assert.equal(buildBiTopicDetail("downtime", overview, labels, sectors).value, "0 min");
  overview.production = undefined;
  assert.equal(buildBiTopicDetail("mtbf", overview, labels, sectors).value, "—");
});

test("ranking and distributions retain registered names, original keys and all returned rows", () => {
  const overview = biTopicFixture();
  const before = JSON.stringify(overview);
  const machines = buildBiTopicDetail("machines", overview, labels, sectors);
  assert.ok(
    machines.rows.some((row) => row.cells[0] === "Qualidade" && row.selection?.value === "m37"),
  );
  const classes = buildBiTopicDetail("classifications", overview, labels, sectors);
  assert.ok(
    classes.rows.some(
      (row) => row.cells[0] === "Manutenção {0}" && row.selection?.value === "sensor",
    ),
  );
  assert.equal(machines.rows.length, overview.machinePareto.length);
  assert.equal(JSON.stringify(overview), before);
});

test("daily data uses operational dates and keeps missing availability null", () => {
  const overview = biTopicFixture();
  overview.production!.daily.push({
    date: "2026-10-16",
    scheduledMinutes: 0,
    scheduledDowntimeMinutes: 0,
    availabilityPercent: null,
  });
  const detail = buildBiTopicDetail("availability-daily", overview, labels, sectors);
  assert.equal(detail.rows.at(-1)?.cells[0], "2026-10-16");
  assert.equal(detail.rows.at(-1)?.cells.at(-1), "—");
  assert.equal(detail.chart?.points.at(-1)?.value, null);
});

test("all topics localize their authored copy while preserving user text and source data", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const overview = biTopicFixture();
  const before = JSON.stringify(overview);
  try {
    for (const language of ["pt-BR", "en", "zh-TW"]) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { documentElement: { lang: language } },
      });
      for (const topic of topics) {
        const detail = buildBiTopicDetail(topic, overview, labels, sectors);
        assert.ok(detail.title && detail.definition && detail.formula, `${language}/${topic}`);
        assert.doesNotMatch(JSON.stringify(detail), /undefined|NaN/);
      }
      const detail = buildBiTopicDetail("classifications", overview, labels, sectors);
      assert.ok(detail.rows.some((row) => row.cells[0] === "Manutenção {0}"));
      assert.equal(
        buildBiTopicDetail("availability", overview, labels, sectors).title,
        language === "en"
          ? "Daily availability"
          : language === "zh-TW"
            ? "每日可用率"
            : "Disponibilidade por dia",
      );
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
  assert.equal(JSON.stringify(overview), before);
});
