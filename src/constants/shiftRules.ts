export const SHIFT_CONFIGS = {
  A: {
    label: "Turno A",
    startTime: "06:00",
    endTime: "14:00",
    totalMinutes: 480,
    productiveTargetMinutes: 420,
  },
  B: {
    label: "Turno B",
    startTime: "14:00",
    endTime: "22:00",
    totalMinutes: 480,
    productiveTargetMinutes: 420,
  },
  C: {
    label: "Turno C",
    startTime: "22:00",
    endTime: "06:00",
    totalMinutes: 480,
    productiveTargetMinutes: 420,
  },
  HC: {
    label: "Horário Comercial",
    startTime: "06:00",
    endTime: "16:00",
    totalMinutes: 600,
    productiveTargetMinutes: 540,
  },
} as const;

export const MINIMUM_EFFICIENCY_PERCENT = 70;
