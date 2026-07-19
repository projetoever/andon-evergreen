import { z } from "zod";

const MAX_ARRAY_ITEMS = 10000;
const MAX_STRING_LEN = 2000;

const shortString = z.string().max(MAX_STRING_LEN);
const isoString = z.string().min(1).max(64);

const machineStatusSchema = z.enum(["running", "stopped"]);
const andonStatusSchema = z.enum([
  "none",
  "open",
  "in_progress",
  "post_maintenance",
  "finished",
  "cancelled",
]);
const callCategorySchema = z.enum(["maintenance", "production"]);
const callSubtypeSchema = z.enum([
  "electrical",
  "mechanical",
  "hot_melt",
  "quality",
  "leadership",
]);
const technicianAreaSchema = z.enum([
  "electrical",
  "mechanical",
  "hot_melt",
]);
const soundKeySchema = z.enum([
  "electrical",
  "mechanical",
  "hot_melt",
  "quality",
  "leadership",
]);
const stopSourceSchema = z.enum([
  "manual_simulation",
  "node_red",
  "manual",
  "clp",
  "system",
]);
const failureClassificationSchema = z.enum([
  "real_machine_failure",
  "electrical_failure",
  "mechanical_failure",
  "automation_sensor_failure",
  "operational_failure",
  "process_failure",
  "operational_process_failure",
  "quality_failure",
  "manual_intervention",
  "simulation_test",
  "unidentified_stop",
  "other",
]);
const productionModeSchema = z.enum([
  "scheduled",
  "not_scheduled",
]);
const callCriticalitySchema = z.enum([
  "low",
  "medium",
  "high",
]);
const callOriginSchema = z.enum([
  "kiosk",
  "installer_health_check",
]);

const stopEventSchema = z
  .object({
    id: shortString,
    machineId: shortString,
    stoppedAt: isoString,
    resumedAt: isoString.nullable().default(null),
    durationMinutes: z.number().finite().min(0),
    source: stopSourceSchema,
    failureDescription: shortString.optional(),
    failureClassification: failureClassificationSchema.optional(),
    productionModeAtStart: productionModeSchema.optional(),
    productionModeAtEnd: productionModeSchema.optional(),
  })
  .passthrough();

const productionEventSchema = z
  .object({
    id: shortString,
    machineId: shortString,
    productionMode: productionModeSchema,
    startedAt: isoString,
    endedAt: isoString.nullable().default(null),
    durationMinutes: z.number().finite().min(0),
  })
  .passthrough();

const machineSchema = z
  .object({
    id: shortString,
    name: shortString,
    machineStatus: machineStatusSchema,
    andonStatus: andonStatusSchema,
    currentCallId: shortString.nullable().default(null),
    lastStatusChangedAt: isoString,
    stoppedAt: isoString.nullable().default(null),
    lastStopDurationMinutes: z.number().finite().min(0),
    stopHistory: z.array(stopEventSchema).max(MAX_ARRAY_ITEMS),
    productionMode: productionModeSchema.default("scheduled"),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().nullable().optional(),
    productionModeChangedAt: isoString.optional(),
    useCommercialShift: z.boolean().default(false),
    productionHistory: z
      .array(productionEventSchema)
      .max(MAX_ARRAY_ITEMS)
      .default([]),
  })
  .passthrough()
  .transform((machine) => ({
    ...machine,
    productionModeChangedAt:
      machine.productionModeChangedAt ??
      machine.lastStatusChangedAt,
  }));

const callSchema = z
  .object({
    id: shortString,
    machineId: shortString,
    category: callCategorySchema,
    subtype: callSubtypeSchema,
    status: andonStatusSchema,
    criticality: callCriticalitySchema.default("medium"),
    machineCondition: machineStatusSchema.default("stopped"),
    openedAt: isoString,
    attendedAt: isoString.nullable().default(null),
    currentAttendanceStartedAt: isoString.nullable().optional(),
    maintenanceCompletedAt: isoString.nullable().default(null),
    finishedAt: isoString.nullable().default(null),
    technicianName: shortString.nullable().default(null),
    technicianNames: z.array(shortString).max(100).optional(),
    technicianArea: technicianAreaSchema.nullable().default(null),
    callWaitingMinutes: z.number().finite().min(0),
    attendanceMinutes: z.number().finite().min(0),
    postMaintenanceMinutes: z.number().finite().min(0).default(0),
    maintenanceReturnCount: z.number().finite().min(0).default(0),
    totalCallMinutes: z.number().finite().min(0),
    machineStoppedMinutes: z.number().finite().min(0),
    notes: shortString.nullable().default(null),
    createdBy: shortString.nullable().default("kiosk"),
    origin: callOriginSchema.default("kiosk"),
    isSystemTest: z.boolean().default(false),

    machineSetId:
      shortString.nullable().optional(),
    machineSetCodeSnapshot:
      shortString.nullable().optional(),
    machineSetNameSnapshot:
      shortString.nullable().optional(),
    machineSetTypeSnapshot:
      shortString.nullable().optional(),

    machineSubsetId:
      shortString.nullable().optional(),
    machineSubsetCodeSnapshot:
      shortString.nullable().optional(),
    machineSubsetNameSnapshot:
      shortString.nullable().optional(),
    machineSubsetTypeSnapshot:
      shortString.nullable().optional(),

    confirmedMachineSetId:
      shortString.nullable().optional(),
    confirmedMachineSetCodeSnapshot:
      shortString.nullable().optional(),
    confirmedMachineSetNameSnapshot:
      shortString.nullable().optional(),
    confirmedMachineSetTypeSnapshot:
      shortString.nullable().optional(),

    confirmedMachineSubsetId:
      shortString.nullable().optional(),
    confirmedMachineSubsetCodeSnapshot:
      shortString.nullable().optional(),
    confirmedMachineSubsetNameSnapshot:
      shortString.nullable().optional(),
    confirmedMachineSubsetTypeSnapshot:
      shortString.nullable().optional(),

    assetConfirmedAt:
      isoString.nullable().optional(),
    assetConfirmedBy:
      shortString.nullable().optional(),
    assetLocationChanged:
      z.boolean().optional(),
    assetChangeReason:
      shortString.nullable().optional(),
    updatedAt: isoString,
  })
  .passthrough()
  .transform((call) => ({
    ...call,
    technicianNames:
      call.technicianNames ??
      (call.technicianName ? [call.technicianName] : []),
    currentAttendanceStartedAt:
      call.currentAttendanceStartedAt ??
      (
        call.status === "in_progress" &&
        call.attendedAt &&
        !call.maintenanceCompletedAt
          ? call.attendedAt
          : null
      ),
  }));

const alertRulesSchema = z
  .object({
    callOpenWarningMinutes: z.number().finite().min(0).max(1440),
    callOpenCriticalMinutes: z.number().finite().min(0).max(1440),
    machineStoppedWarningMinutes: z.number().finite().min(0).max(1440),
    machineStoppedCriticalMinutes: z.number().finite().min(0).max(1440),
  })
  .passthrough();

const themeSettingsSchema = z
  .object({
    primaryColor: shortString,
    dangerColor: shortString,
    warningColor: shortString,
    successColor: shortString,
    neutralColor: shortString,
  })
  .passthrough();

const appSettingsSchema = z
  .object({
    appName: shortString,
    kioskMode: z.boolean(),
    simulationMode: z.boolean(),
    soundsEnabled: z.boolean(),
    soundVolume: z.number().finite().min(0).max(1),
    alertRules: alertRulesSchema,
    theme: themeSettingsSchema,
  })
  .passthrough();

const soundConfigSchema = z
  .object({
    key: soundKeySchema,
    label: shortString,
    fileName: shortString,
    enabled: z.boolean(),
    repeatUntilAttended: z.boolean(),
    repeatIntervalSeconds: z.number().finite().min(0).max(3600),
  })
  .passthrough();

export const appBackupSchema = z
  .object({
    exportedAt: isoString,
    appVersion: shortString,
    machines: z.array(machineSchema).max(MAX_ARRAY_ITEMS),
    calls: z.array(callSchema).max(MAX_ARRAY_ITEMS),
    settings: appSettingsSchema,
    soundConfigs: z.array(soundConfigSchema).max(100),
  })
  .passthrough();