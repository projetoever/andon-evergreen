export type AndonBiPeriodPreset = "24h" | "7d" | "30d";

export type AndonBiFilters = {
  period: AndonBiPeriodPreset;
  machineId: string;
  subtype: string;
  classification: string;
};

export type AnalyticsOverview = {
  meta: {
    metricDefinitionVersion: string;
    generatedAt: string;
    timeZone: string;
    period: {
      start: string;
      end: string;
      effectiveEnd: string;
    };
    filters: {
      machineId?: string;
      subtype?: string;
      classification?: string;
    };
    exclusions: {
      systemTests: boolean;
    };
  };
  kpis: {
    callsOpened: number;
    activeCallsNow: number | null;
    callsFinished: number;
    mttaMinutes: number | null;
    avgMaintenanceMinutes: number | null;
    avgPostMaintenanceMinutes: number | null;
    avgTotalCallMinutes: number | null;
    downtimeMinutes: number;
    failureOccurrences: number;
    returnedCalls: number;
    maintenanceReturnCycles: number;
    maintenanceReturnRatePercent: number | null;
  };
  trend: Array<{
    date: string;
    callsOpened: number;
    callsFinished: number;
  }>;
  machinePareto: Array<{
    machineId: string;
    machineName: string;
    downtimeMinutes: number;
    occurrences: number;
  }>;
  classificationPareto: Array<{
    label: string;
    count: number;
  }>;
  sectorDistribution: Array<{
    label: string;
    count: number;
  }>;
  coverage: {
    mttaSampleSize: number;
    maintenanceTimeSampleSize: number;
    finishedCalls: number;
    finishedCallsWithClassification: number;
    failureEventsOverlappingPeriod: number;
    failureEventsWithClassification: number;
    failureEventsLinkedToCalls: number;
  };
};

export type AndonBiMachineOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type AndonBiSectorOption = {
  id: string;
  displayName: string;
  active: boolean;
  categoryGroup: string;
};

export type AndonBiClassificationOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
};

export type AndonBiFilterOptions = {
  machines: AndonBiMachineOption[];
  sectors: AndonBiSectorOption[];
  classifications: AndonBiClassificationOption[];
};
