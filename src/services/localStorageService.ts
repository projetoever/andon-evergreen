const memoryStorage = new Map<string, string>();

export function loadFromStorage<T>(key: string, fallback: T): T {
  const raw = memoryStorage.get(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  memoryStorage.set(key, JSON.stringify(value));
}

export function removeFromStorage(key: string): void {
  memoryStorage.delete(key);
}
