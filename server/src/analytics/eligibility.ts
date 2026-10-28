import type { Prisma } from "@prisma/client";

export const RESPONSIBILITIES = [
  "maintenance",
  "operations",
  "process",
  "quality",
  "leadership",
  "other",
  "unassigned",
] as const;
export const DISPOSITIONS = ["include", "test", "false_call", "duplicate"] as const;
export const EXCLUDED_DISPOSITIONS = ["test", "false_call", "duplicate"];
// Exact reserved identifiers only. Operational ownership is never guessed from a label.
export const RESERVED_EXCLUSIONS = [
  "test",
  "teste",
  "testing",
  "system_test",
  "teste_sistema",
  "false_call",
  "falso_chamado",
  "duplicate",
  "duplicado",
];
export const GENERIC_DIAGNOSES = ["unclassified", "unidentified_stop", "real_machine_failure"];
export function hasSpecificDiagnosis(value?: string | null): value is string {
  return Boolean(value?.trim()) && !GENERIC_DIAGNOSES.includes(value!.trim());
}
export const METRIC_VERSION = "bi-causal-1";

export type DiagnosisSnapshot = {
  failureResponsibility: string | null;
  analyticsDisposition: string | null;
};

export function reservedDisposition(value: string) {
  if (["false_call", "falso_chamado"].includes(value)) return "false_call";
  if (["duplicate", "duplicado"].includes(value)) return "duplicate";
  return RESERVED_EXCLUSIONS.includes(value) ? "test" : null;
}

export function diagnosisSnapshot(
  catalog: { responsibility: string; analyticsDisposition: string; value: string } | null,
): DiagnosisSnapshot {
  return {
    failureResponsibility: catalog?.responsibility ?? null,
    analyticsDisposition: catalog
      ? (reservedDisposition(catalog.value) ?? catalog.analyticsDisposition)
      : null,
  };
}

export function uniqueById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export function isEligible(record: {
  isSystemTest?: boolean;
  linkedCallIsSystemTest?: boolean;
  status?: string;
  analyticsDisposition?: string | null;
  failureClassification?: string | null;
  classification?: string | null;
}) {
  return (
    !record.isSystemTest &&
    !record.linkedCallIsSystemTest &&
    !["cancelled", "canceled"].includes(record.status ?? "") &&
    !EXCLUDED_DISPOSITIONS.includes(record.analyticsDisposition ?? "") &&
    !RESERVED_EXCLUSIONS.includes(record.failureClassification ?? record.classification ?? "")
  );
}

/** New records use immutable occurrence snapshots. Legacy exclusions can be
 * explicitly configured in the catalog; legacy responsibility stays unknown. */
export function analyticsEligibility(
  catalog: Array<{ value: string; analyticsDisposition: string }>,
) {
  const excludedValues = [
    ...new Set([
      ...RESERVED_EXCLUSIONS,
      ...catalog
        .filter((row) => EXCLUDED_DISPOSITIONS.includes(row.analyticsDisposition))
        .map((row) => row.value),
    ]),
  ];
  const diagnosisConditions: Prisma.AndonCallWhereInput[] = [
    {
      OR: [
        { analyticsDisposition: "include" },
        {
          analyticsDisposition: null,
          OR: [
            { failureClassification: null },
            { failureClassification: { notIn: excludedValues } },
          ],
        },
      ],
    },
    {
      OR: [
        { failureClassification: null },
        { failureClassification: { notIn: RESERVED_EXCLUSIONS } },
      ],
    },
  ];
  const callWhere: Prisma.AndonCallWhereInput = {
    isSystemTest: false,
    AND: [{ status: { notIn: ["cancelled", "canceled"] } }, ...diagnosisConditions],
  };
  // Eligibility of the physical event without consulting any linked call.
  // Restricted BI reads use this for events pointing to foreign machines:
  // the event's own snapshots, not an out-of-scope call, decide inclusion.
  const eventOwnWhere: Prisma.FailureEventWhereInput = {
    AND: [
      {
        OR: [
          { analyticsDisposition: "include" },
          {
            analyticsDisposition: null,
            OR: [
              { classification: null },
              { classification: { notIn: excludedValues } },
            ],
          },
        ],
      },
      { OR: [{ classification: null }, { classification: { notIn: RESERVED_EXCLUSIONS } }] },
    ],
  };
  const eventWhere: Prisma.FailureEventWhereInput = {
    AND: [
      {
        OR: [
          { analyticsDisposition: "include" },
          {
            analyticsDisposition: null,
            OR: [
              // A reviewed call can supply the missing legacy disposition without
              // inheriting an unproven physical responsibility from its last owner.
              { call: { is: { analyticsDisposition: "include" } } },
              { OR: [{ classification: null }, { classification: { notIn: excludedValues } }] },
            ],
          },
        ],
      },
      { OR: [{ classification: null }, { classification: { notIn: RESERVED_EXCLUSIONS } }] },
      {
        OR: [{ callId: null }, { call: { is: { isSystemTest: false, AND: diagnosisConditions } } }],
      },
    ],
  };
  return { callWhere, eventWhere, eventOwnWhere };
}
