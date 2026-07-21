import type { AndonCall } from "@/types/andon";

export type AssetLocationCall = Pick<
  AndonCall,
  | "machineSetId"
  | "machineSetCodeSnapshot"
  | "machineSetNameSnapshot"
  | "machineSetTypeSnapshot"
  | "machineSubsetId"
  | "machineSubsetCodeSnapshot"
  | "machineSubsetNameSnapshot"
  | "machineSubsetTypeSnapshot"
  | "confirmedMachineSetId"
  | "confirmedMachineSetCodeSnapshot"
  | "confirmedMachineSetNameSnapshot"
  | "confirmedMachineSetTypeSnapshot"
  | "confirmedMachineSubsetId"
  | "confirmedMachineSubsetCodeSnapshot"
  | "confirmedMachineSubsetNameSnapshot"
  | "confirmedMachineSubsetTypeSnapshot"
  | "assetConfirmedAt"
  | "assetConfirmedBy"
  | "assetLocationChanged"
>;

export interface AssetLocationSnapshot {
  setId: string | null;
  setCode: string | null;
  setName: string | null;
  setType: string | null;
  subsetId: string | null;
  subsetCode: string | null;
  subsetName: string | null;
  subsetType: string | null;
}

function normalizedText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();

  return normalized
    ? normalized
    : null;
}

function getAssetLabel(
  name: string | null,
  code: string | null,
): string | null {
  return (
    normalizedText(name) ??
    normalizedText(code)
  );
}

function getSnapshotPartKey(
  id: string | null,
  code: string | null,
  name: string | null,
  type: string | null,
): string | null {
  const normalizedId = normalizedText(id);

  if (normalizedId) {
    return `id:${normalizedId}`;
  }

  const snapshotValues = [
    normalizedText(code) ?? "",
    normalizedText(name) ?? "",
    normalizedText(type) ?? "",
  ];

  return snapshotValues.some(Boolean)
    ? `snapshot:${snapshotValues.join("|")}`
    : null;
}

export function getOpeningAssetLocation(
  call: AssetLocationCall,
): AssetLocationSnapshot {
  return {
    setId: normalizedText(call.machineSetId),
    setCode: normalizedText(
      call.machineSetCodeSnapshot,
    ),
    setName: normalizedText(
      call.machineSetNameSnapshot,
    ),
    setType: normalizedText(
      call.machineSetTypeSnapshot,
    ),

    subsetId: normalizedText(
      call.machineSubsetId,
    ),
    subsetCode: normalizedText(
      call.machineSubsetCodeSnapshot,
    ),
    subsetName: normalizedText(
      call.machineSubsetNameSnapshot,
    ),
    subsetType: normalizedText(
      call.machineSubsetTypeSnapshot,
    ),
  };
}

export function hasAssetConfirmation(
  call: AssetLocationCall,
): boolean {
  return Boolean(
    normalizedText(call.assetConfirmedAt) ||
      normalizedText(call.assetConfirmedBy) ||
      call.assetLocationChanged === true ||
      normalizedText(
        call.confirmedMachineSetId,
      ) ||
      normalizedText(
        call.confirmedMachineSetCodeSnapshot,
      ) ||
      normalizedText(
        call.confirmedMachineSetNameSnapshot,
      ) ||
      normalizedText(
        call.confirmedMachineSetTypeSnapshot,
      ) ||
      normalizedText(
        call.confirmedMachineSubsetId,
      ) ||
      normalizedText(
        call.confirmedMachineSubsetCodeSnapshot,
      ) ||
      normalizedText(
        call.confirmedMachineSubsetNameSnapshot,
      ) ||
      normalizedText(
        call.confirmedMachineSubsetTypeSnapshot,
      )
  );
}

export function getConfirmedAssetLocation(
  call: AssetLocationCall,
): AssetLocationSnapshot | null {
  if (!hasAssetConfirmation(call)) {
    return null;
  }

  return {
    setId: normalizedText(
      call.confirmedMachineSetId,
    ),
    setCode: normalizedText(
      call.confirmedMachineSetCodeSnapshot,
    ),
    setName: normalizedText(
      call.confirmedMachineSetNameSnapshot,
    ),
    setType: normalizedText(
      call.confirmedMachineSetTypeSnapshot,
    ),

    subsetId: normalizedText(
      call.confirmedMachineSubsetId,
    ),
    subsetCode: normalizedText(
      call.confirmedMachineSubsetCodeSnapshot,
    ),
    subsetName: normalizedText(
      call.confirmedMachineSubsetNameSnapshot,
    ),
    subsetType: normalizedText(
      call.confirmedMachineSubsetTypeSnapshot,
    ),
  };
}

export function getEffectiveAssetLocation(
  call: AssetLocationCall,
): AssetLocationSnapshot {
  return (
    getConfirmedAssetLocation(call) ??
    getOpeningAssetLocation(call)
  );
}

export function formatAssetLocation(
  location: AssetLocationSnapshot,
  emptyLabel = "Sem conjunto informado",
): string {
  const parts = [
    getAssetLabel(
      location.setName,
      location.setCode,
    ),
    getAssetLabel(
      location.subsetName,
      location.subsetCode,
    ),
  ].filter(
    (value): value is string =>
      Boolean(value),
  );

  return parts.length > 0
    ? parts.join(" › ")
    : emptyLabel;
}

export function getOpeningAssetLocationLabel(
  call: AssetLocationCall,
  emptyLabel?: string,
): string {
  return formatAssetLocation(
    getOpeningAssetLocation(call),
    emptyLabel,
  );
}

export function getConfirmedAssetLocationLabel(
  call: AssetLocationCall,
  emptyLabel = "Não confirmada",
): string {
  const confirmed =
    getConfirmedAssetLocation(call);

  return confirmed
    ? formatAssetLocation(
        confirmed,
        "Sem conjunto informado",
      )
    : emptyLabel;
}

export function getEffectiveAssetLocationLabel(
  call: AssetLocationCall,
  emptyLabel?: string,
): string {
  return formatAssetLocation(
    getEffectiveAssetLocation(call),
    emptyLabel,
  );
}

export function getAssetLocationKey(
  location: AssetLocationSnapshot,
): string {
  const setKey = getSnapshotPartKey(
    location.setId,
    location.setCode,
    location.setName,
    location.setType,
  );

  const subsetKey = getSnapshotPartKey(
    location.subsetId,
    location.subsetCode,
    location.subsetName,
    location.subsetType,
  );

  return `${setKey ?? "none"}::${subsetKey ?? "none"}`;
}

export function areAssetLocationsEqual(
  left: AssetLocationSnapshot,
  right: AssetLocationSnapshot,
): boolean {
  return (
    getAssetLocationKey(left) ===
    getAssetLocationKey(right)
  );
}