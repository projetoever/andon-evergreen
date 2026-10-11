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
    semantics?: {
      mtta?: string;
      mttr?: string;
      downtime?: string;
      mtbfEstimated?: string;
      activeCalls?: string;
    };
  };
  kpis: {
    callsOpened: number;
    activeCallsNow: number | null;
    callsFinished: number;
    mttaMinutes: number | null;
    mttrMinutes: number | null;
    avgMaintenanceMinutes: number | null;
    avgPostMaintenanceMinutes: number | null;
    avgTotalCallMinutes: number | null;
    downtimeMinutes: number;
    avgDowntimePerEpisodeMinutes: number | null;
    failureOccurrences: number;
    physicalStopEpisodes: number;
    mtbfEstimatedMinutes: number | null;
    mtbfEstimatedMachineCount: number | null;
    returnedCalls: number;
    maintenanceReturnCycles: number;
    maintenanceReturnRatePercent: number | null;
    classificationCoveragePercent: number | null;
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
    mttrMinutes: AnalyticsMetricComparison;
    mtbfEstimatedMinutes: AnalyticsMetricComparison;
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
    mttrSampleSize: number;
    maintenanceTimeSampleSize: number;
    finishedCalls: number;
    finishedCallsWithClassification: number;
    failureEventsOverlappingPeriod: number;
    failureEventsWithClassification: number;
    failureEventsLinkedToCalls: number;
    calendarExposureMinutes: number | null;
    operatingExposureMinutes: number | null;
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


export type AnalyticsMaintenanceParticipation = {
  meta: {
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
    semantics: {
      personMinutes: string;
      phases: string;
      interpretation: string;
    };
  };
  totals: {
    maintenancePersonMinutes: number;
    followUpPersonMinutes: number;
    totalPersonMinutes: number;
    technicianCount: number;
    callCount: number;
    activeSessionCount: number;
    returnCycleSessions: number;
  };
  technicians: Array<{
    technicianId: string | null;
    technicianName: string;
    maintenanceMinutes: number;
    followUpMinutes: number;
    totalPersonMinutes: number;
    callCount: number;
    sessionCount: number;
    technicalAreas: string[];
    returnCycleSessions: number;
    activePhase: "maintenance" | "follow_up" | null;
  }>;
  technicalAreas: Array<{
    technicalArea: string | null;
    maintenanceMinutes: number;
    followUpMinutes: number;
    totalPersonMinutes: number;
    technicianCount: number;
    sessionCount: number;
  }>;
  coverage: {
    totalSessions: number;
    phaseAwareSessions: number;
    legacySessions: number;
    phaseAwareSessionPercent: number | null;
    phaseAwareMinutes: number;
    legacyMinutes: number;
    phaseAwareMinutePercent: number | null;
  };
};
