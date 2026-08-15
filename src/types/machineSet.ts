export type MachineSetId = string;
export type MachineSubsetId = string;
export type MachineSetTypeId = string;
export type MachineSubsetTypeId = string;

export interface MachineAssetTypeSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface MachineAssetCatalogItem
  extends MachineAssetTypeSummary {
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type MachineSetType =
  MachineAssetCatalogItem;

export type MachineSubsetType =
  MachineAssetCatalogItem;

export interface MachineSubset {
  id: MachineSubsetId;
  machineSetId: MachineSetId;
  typeId: MachineSubsetTypeId | null;
  code: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  assetTag: string | null;
  isActive: boolean;
  displayOrder: number | null;
  subsetType?: MachineAssetTypeSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachineSet {
  id: MachineSetId;
  machineId: string;
  code: string;
  name: string;

  /**
   * Campo legado mantido apenas para leitura,
   * snapshots e compatibilidade histórica.
   */
  type?: string | null;

  typeId: MachineSetTypeId | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number | null;
  setType?: MachineAssetTypeSummary | null;
  subsets?: MachineSubset[];
  subsetCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MachineCatalogDraft {
  code?: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

export interface MachineCatalogPatch {
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

export interface MachineSetDraft {
  code?: string;
  name: string;
  typeId: MachineSetTypeId;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
}

export interface MachineSetPatch {
  code?: string;
  name?: string;
  typeId?: MachineSetTypeId;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
}

export interface MachineSubsetDraft {
  code?: string;
  name: string;
  typeId: MachineSubsetTypeId;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  assetTag?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
}

export interface MachineSubsetPatch {
  code?: string;
  name?: string;
  typeId?: MachineSubsetTypeId;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  assetTag?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
}

export type MachineSetIncludeSubsets =
  | "count"
  | "list";

export interface MachineSetListOptions {
  includeInactive?: boolean;
  includeSubsets?: MachineSetIncludeSubsets;
}

export interface CatalogDeleteResult<
  TCatalog extends MachineAssetCatalogItem,
> {
  deleted: boolean;
  inactivated: boolean;
  id?: string;
  type?: TCatalog;
}

export interface MachineSetDeleteResult {
  deleted: boolean;
  inactivated: boolean;
  id?: MachineSetId;
  set?: MachineSet;
}

export interface MachineSubsetDeleteResult {
  deleted: boolean;
  inactivated: boolean;
  id?: MachineSubsetId;
  subset?: MachineSubset;
}
