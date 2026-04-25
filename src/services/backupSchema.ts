import { z } from "zod";

const MAX_ARRAY_ITEMS = 10000;
const MAX_STRING_LEN = 2000;

const shortString = z.string().max(MAX_STRING_LEN);
const isoString = z.string().min(1).max(64);

const machineStatusSchema = z.enum(["running", "stopped"]);
const andonStatusSchema = z.enum(["none", "open", "in_progress", "finished"]);
const callCategorySchema = z.enum(["maintenance", "production"]);
const callSubtypeSchema = z.enum([
  "electrical",
  "mechanical",
  "hot_melt",
  "quality",
  "leadership",
]);
const technicianAreaSchema = z.enum(["electrical", "mechanical", "hot_melt"]);
const soundKeySchema = z.enum([
  "electrical",
  "mechanical",
  "hot_melt",
  "quality",
  "leadership",
]);
const stopSourceSchema = z.enum(["manual_simulation", "node_red"]);

const stopEventSchema = z.object({
  id: shortString,
  machineId: shortString,
  stoppedAt: isoString,
  resumedAt: isoString.nullable(),
  durationMinutes: z.number().finite().min(0),
  source: stopSourceSchema,
});

const machineSchema = z.object({
  id: shortString,
  name: shortString,
  machineStatus: machineStatusSchema,
  andonStatus: andonStatusSchema,
  currentCallId: shortString.nullable(),
  lastStatusChangedAt: isoString,
  stoppedAt: isoString.nullable(),
  lastStopDurationMinutes: z.number().finite().min(0),
  stopHistory: z.array(stopEventSchema).max(MAX_ARRAY_ITEMS),
});

const callSchema = z.object({
  id: shortString,
  machineId: shortString,
  category: callCategorySchema,
  subtype: callSubtypeSchema,
  status: andonStatusSchema,
  openedAt: isoString,
  attendedAt: isoString.nullable(),
  finishedAt: isoString.nullable(),
  technicianName: shortString.nullable(),
  technicianArea: technicianAreaSchema.nullable(),
  callWaitingMinutes: z.number().finite().min(0),
  attendanceMinutes: z.number().finite().min(0),
  totalCallMinutes: z.number().finite().min(0),
  machineStoppedMinutes: z.number().finite().min(0),
  notes: shortString.nullable(),
  createdBy: z.literal("kiosk"),
  updatedAt: isoString,
});

const alertRulesSchema = z.object({
  callOpenWarningMinutes: z.number().finite().min(0).max(1440),
  callOpenCriticalMinutes: z.number().finite().min(0).max(1440),
  machineStoppedWarningMinutes: z.number().finite().min(0).max(1440),
  machineStoppedCriticalMinutes: z.number().finite().min(0).max(1440),
});

const themeSettingsSchema = z.object({
  primaryColor: shortString,
  dangerColor: shortString,
  warningColor: shortString,
  successColor: shortString,
  neutralColor: shortString,
});

const appSettingsSchema = z.object({
  appName: shortString,
  kioskMode: z.boolean(),
  simulationMode: z.boolean(),
  soundsEnabled: z.boolean(),
  soundVolume: z.number().finite().min(0).max(1),
  alertRules: alertRulesSchema,
  theme: themeSettingsSchema,
});

const soundConfigSchema = z.object({
  key: soundKeySchema,
  label: shortString,
  fileName: shortString,
  enabled: z.boolean(),
  repeatUntilAttended: z.boolean(),
  repeatIntervalSeconds: z.number().finite().min(0).max(3600),
});

export const appBackupSchema = z.object({
  exportedAt: isoString,
  appVersion: shortString,
  machines: z.array(machineSchema).max(MAX_ARRAY_ITEMS),
  calls: z.array(callSchema).max(MAX_ARRAY_ITEMS),
  settings: appSettingsSchema,
  soundConfigs: z.array(soundConfigSchema).max(100),
});
