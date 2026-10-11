export type AndonBiPeriodPreset = "24h" | "7d" | "30d";

export type AndonBiFilters = {
  period: AndonBiPeriodPreset;
  machineId: string;
  subtype: string;
  classification: string;
};

export type AnalyticsMetricComparison = {
  current: number | null;
  previous: number | null;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | "new" | "unavailable";
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
  downtimeTrend: Array<{
    date: string;
    downtimeMinutes: number;
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
  comparison: {
    period: {
      start: string;
      end: string;
    };
    callsOpened: AnalyticsMetricComparison;
    downtimeMinutes: AnalyticsMetricComparison;
    mttaMinutes: AnalyticsMetricComparison;
    maintenanceReturnRate: {
      current: number | null;
      previous: number | null;
      deltaPoints: number | null;
    };
  };
  highlights: {
    topMachine: {
      machineId: string;
      machineName: string;
      downtimeMinutes: number;
      occurrences: number;
      sharePercent: number;
    } | null;
    topClassification: {
      classification: string;
      count: number;
      sharePercent: number;
    } | null;
    topSector: {
      subtype: string;
      count: number;
      sharePercent: number;
    } | null;
  };
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

export type AnalyticsDrilldownDimension = "machine" | "classification" | "sector";

export type AnalyticsDrilldownSelection = {
  dimension: AnalyticsDrilldownDimension;
  value: string;
  label: string;
};

export type AnalyticsDrilldownItem = {
  kind: "failure_event" | "call";
  id: string;
  callId: string | null;
  machineId: string;
  machineName: string;
  subtype: string | null;
  classification: string | null;
  occurredAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: string | null;
  workOrderNumber: string | null;
  technicianNames: string[];
  description: string | null;
  source: string;
};

export type AnalyticsDrilldownResult = {
  meta: {
    generatedAt: string;
    timeZone: string;
    period: {
      start: string;
      end: string;
      effectiveEnd: string;
    };
  };
  dimension: AnalyticsDrilldownDimension;
  value: string;
  items: AnalyticsDrilldownItem[];
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
