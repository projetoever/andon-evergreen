import type { CallSubtype } from "@/types/andon";
import type { AndonSoundConfig, SoundMachineId } from "@/types/sound";

const DB_NAME = "andonSoundSettings";
const DB_VERSION = 1;
const STORE_NAME = "soundConfigs";

interface SoundConfigRecord {
  id: string;
  machineId: SoundMachineId;
  subtype: CallSubtype;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
  blob: Blob;
}

function getConfigId(machineId: SoundMachineId, subtype: CallSubtype): string {
  return `${machineId}:${subtype}`;
}

function mapToConfig(record: SoundConfigRecord): AndonSoundConfig {
  return {
    id: record.id,
    machineId: record.machineId,
    subtype: record.subtype,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    updatedAt: record.updatedAt,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o IndexedDB"));
  });
}

async function runTransaction<T>(mode: IDBTransactionMode, runner: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, mode);
  const store = tx.objectStore(STORE_NAME);

  try {
    const result = await runner(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro na transação do IndexedDB"));
      tx.onabort = () => reject(tx.error ?? new Error("Transação abortada no IndexedDB"));
    });
    return result;
  } finally {
    db.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao acessar IndexedDB"));
  });
}

export async function saveSoundConfig(machineId: SoundMachineId, subtype: CallSubtype, file: File): Promise<AndonSoundConfig> {
  const id = getConfigId(machineId, subtype);
  const updatedAt = new Date().toISOString();

  const record: SoundConfigRecord = {
    id,
    machineId,
    subtype,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    sizeBytes: file.size,
    updatedAt,
    blob: file,
  };

  return runTransaction("readwrite", async (store) => {
    await requestToPromise(store.put(record));
    return mapToConfig(record);
  });
}

export async function getSoundConfig(machineId: SoundMachineId, subtype: CallSubtype): Promise<AndonSoundConfig | null> {
  return runTransaction("readonly", async (store) => {
    const record = await requestToPromise(store.get(getConfigId(machineId, subtype)) as IDBRequest<SoundConfigRecord | undefined>);
    return record ? mapToConfig(record) : null;
  });
}

export async function getSoundBlob(machineId: SoundMachineId, subtype: CallSubtype): Promise<Blob | null> {
  return runTransaction("readonly", async (store) => {
    const record = await requestToPromise(store.get(getConfigId(machineId, subtype)) as IDBRequest<SoundConfigRecord | undefined>);
    return record?.blob ?? null;
  });
}

export async function removeSoundConfig(machineId: SoundMachineId, subtype: CallSubtype): Promise<void> {
  return runTransaction("readwrite", async (store) => {
    await requestToPromise(store.delete(getConfigId(machineId, subtype)));
  });
}

export async function listSoundConfigs(): Promise<AndonSoundConfig[]> {
  return runTransaction("readonly", async (store) => {
    const records = await requestToPromise(store.getAll() as IDBRequest<SoundConfigRecord[]>);
    return records.map(mapToConfig).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

// TODO: Futuramente substituir IndexedDB por API Node.js mantendo a mesma assinatura.
