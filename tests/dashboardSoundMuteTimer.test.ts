import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateDashboardSoundMuteSettingsPatch } from "../server/src/services/dashboardSoundMuteSettings";
import {
  DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  getKnownRealCallIds,
  hasNewRealCall,
  startDashboardSoundMuteTimer,
} from "../src/utils/dashboardSoundMuteUtils";
import { updateSystemSettings } from "../src/services/systemSettingsService";
import type { SystemSettingsPatch } from "../src/types/systemSettings";

const existingOpenCall = { id: "call-a", status: "open" as const, isSystemTest: false };

function fakeTimer() {
  let callback: (() => void) | null = null;
  let delay: number | null = null;
  let clearCount = 0;
  const schedule = ((handler: () => void, timeout: number) => {
    callback = handler;
    delay = timeout;
    return 1;
  }) as unknown as typeof setTimeout;
  const cancel = (() => {
    clearCount += 1;
  }) as typeof clearTimeout;

  return {
    schedule,
    cancel,
    run: () => callback?.(),
    getDelay: () => delay,
    getClearCount: () => clearCount,
  };
}

test("defaults mantêm temporizador desligado e duração de três minutos", async () => {
  const [schema, migration, service] = await Promise.all([
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../server/prisma/migrations/20260930110000_add_dashboard_sound_mute_timer/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/services/systemSettingsService.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES, 3);
  assert.match(schema, /dashboardSoundMuteTimerEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /dashboardSoundMuteDurationMinutes\s+Int\s+@default\(3\)/);
  assert.match(migration, /BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /INTEGER NOT NULL DEFAULT 3/);
  assert.doesNotMatch(migration, /^(?:\s*)(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
  assert.match(service, /dashboardSoundMuteTimerEnabled: false/);
  assert.match(service, /dashboardSoundMuteDurationMinutes: 3/);
});

test("PATCH aceita habilitar e desabilitar o temporizador", () => {
  assert.equal(
    validateDashboardSoundMuteSettingsPatch({ dashboardSoundMuteTimerEnabled: true }),
    null,
  );
  assert.equal(
    validateDashboardSoundMuteSettingsPatch({ dashboardSoundMuteTimerEnabled: false }),
    null,
  );
});

test("PATCH aceita duração inteira a partir de um minuto", () => {
  assert.equal(
    validateDashboardSoundMuteSettingsPatch({ dashboardSoundMuteDurationMinutes: 1 }),
    null,
  );
  assert.equal(
    validateDashboardSoundMuteSettingsPatch({ dashboardSoundMuteDurationMinutes: 30 }),
    null,
  );
});

test("PATCH rejeita tipos e durações inválidas", () => {
  for (const value of [0, -1, 1.5, "3", null]) {
    assert.match(
      validateDashboardSoundMuteSettingsPatch({
        dashboardSoundMuteDurationMinutes: value,
      }) ?? "",
      /inteiro de pelo menos 1 minuto/,
    );
  }
  assert.match(
    validateDashboardSoundMuteSettingsPatch({
      dashboardSoundMuteTimerEnabled: "true",
    }) ?? "",
    /deve ser booleano/,
  );
});

test("modo local rejeita flag de temporizador que não seja booleana", async () => {
  await assert.rejects(
    updateSystemSettings({
      dashboardSoundMuteTimerEnabled: "true",
    } as unknown as SystemSettingsPatch),
    /dashboardSoundMuteTimerEnabled deve ser booleano/,
  );
});

test("temporizador desabilitado preserva silêncio manual indefinido", () => {
  const timer = fakeTimer();
  let expired = false;
  startDashboardSoundMuteTimer(
    false,
    3,
    () => {
      expired = true;
    },
    timer.schedule,
    timer.cancel,
  );

  timer.run();
  assert.equal(timer.getDelay(), null);
  assert.equal(expired, false);
});

test("temporizador habilitado reativa após a duração configurada", () => {
  const timer = fakeTimer();
  let expired = false;
  startDashboardSoundMuteTimer(
    true,
    3,
    () => {
      expired = true;
    },
    timer.schedule,
    timer.cancel,
  );

  assert.equal(timer.getDelay(), 180_000);
  timer.run();
  assert.equal(expired, true);
});

test("reativação manual cancela o timer e invalida callback antigo", () => {
  const timer = fakeTimer();
  let expired = false;
  const cancelMute = startDashboardSoundMuteTimer(
    true,
    3,
    () => {
      expired = true;
    },
    timer.schedule,
    timer.cancel,
  );

  cancelMute();
  timer.run();
  assert.equal(timer.getClearCount(), 1);
  assert.equal(expired, false);
});

test("novo chamado real criado durante silêncio interrompe o mute", () => {
  const baseline = getKnownRealCallIds([existingOpenCall]);
  assert.equal(
    hasNewRealCall(baseline, [
      existingOpenCall,
      { id: "call-b", status: "open", isSystemTest: false },
    ]),
    true,
  );
});

test("novo chamado real ainda quebra o mute se já mudou de status entre pollings", () => {
  const baseline = getKnownRealCallIds([existingOpenCall]);
  assert.equal(
    hasNewRealCall(baseline, [
      existingOpenCall,
      { id: "call-b", status: "in_progress", isSystemTest: false },
    ]),
    true,
  );
});

test("atualização do chamado existente não é tratada como novo chamado", () => {
  const baseline = getKnownRealCallIds([existingOpenCall]);
  assert.equal(hasNewRealCall(baseline, [{ ...existingOpenCall, status: "open" }]), false);
});

test("polling ou reordenação dos mesmos IDs não interrompe o mute", () => {
  const callB = { id: "call-b", status: "open" as const, isSystemTest: false };
  const baseline = getKnownRealCallIds([existingOpenCall, callB]);
  assert.equal(hasNewRealCall(baseline, [callB, existingOpenCall]), false);
});

test("system test não interrompe o mute", () => {
  const baseline = getKnownRealCallIds([existingOpenCall]);
  assert.equal(
    hasNewRealCall(baseline, [
      existingOpenCall,
      { id: "system-call", status: "open", isSystemTest: true },
    ]),
    false,
  );
});

test("dashboard volta a delegar reprodução ao hook normal após reativação", async () => {
  const dashboard = await readFile(
    new URL("../src/pages/DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /useAndonOpenCallSound\(/);
  assert.match(dashboard, /audioUnlocked: audioUnlocked && !dashboardSoundMuted/);
  assert.match(dashboard, /soundScope: "dashboard"/);
  assert.match(dashboard, /setDashboardSoundMuted\(false\)/);
  assert.match(dashboard, /hasNewRealCall\(mutedKnownCallIdsRef\.current, calls\)/);
  assert.match(dashboard, /SYSTEM_SETTINGS_CHANGED_EVENT/);
});

test("Admin e API persistem os dois campos sem alterar arquivos de áudio", async () => {
  const [admin, route, types] = await Promise.all([
    readFile(
      new URL("../src/components/settings/DashboardSoundMuteSettings.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../server/src/routes/systemSettings.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/types/systemSettings.ts", import.meta.url), "utf8"),
  ]);

  for (const source of [admin, route, types]) {
    assert.match(source, /dashboardSoundMuteTimerEnabled/);
    assert.match(source, /dashboardSoundMuteDurationMinutes/);
  }
  assert.match(admin, /updateSystemSettings\(/);
  assert.doesNotMatch(admin, /saveSoundConfig|removeSoundConfig/);
});
