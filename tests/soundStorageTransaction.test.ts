import assert from "node:assert/strict";
import test from "node:test";
import { getSoundConfig, saveSoundConfig } from "../src/services/soundStorageService";

test("CFG-15K: fast IndexedDB completion never strands sound reads or saves", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });

  const records = new Map<string, unknown>();
  let closeCount = 0;
  let completeCount = 0;
  const fakeDatabase = {
    transaction(_name: string, _mode: string) {
      const tx: any = {
        oncomplete: null, onerror: null, onabort: null, readyState: "active",
        abort() {
          tx.readyState = "done";
          tx.onabort?.({ type: "abort" });
        },
        objectStore() {
          const immediate = (result: unknown) => {
            const request: any = { result, onsuccess: null, onerror: null };
            // Intentionally complete BEFORE the awaiting async runner resumes.
            queueMicrotask(() => {
              request.onsuccess?.({ type: "success" });
              tx.readyState = "done";
              completeCount += 1;
              tx.oncomplete?.({ type: "complete" });
            });
            return request;
          };
          return {
            get(key: IDBValidKey) { return immediate(records.get(String(key))); },
            put(value: { id: string }) {
              records.set(value.id, value);
              return immediate(value.id);
            },
          };
        },
      };
      return tx;
    },
    close() { closeCount += 1; },
  };
  const fakeFactory = {
    open() {
      const request: any = { result: undefined, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        request.result = fakeDatabase;
        request.onsuccess?.({ type: "success" });
      });
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", {
    value: fakeFactory, configurable: true, writable: true,
  });

  const bounded = async <T>(promise: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("IndexedDB transaction did not resolve")), 1500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  assert.equal(await bounded(getSoundConfig("machine-10", "electrical")), null);
  const file = { name: "local.ogg", type: "audio/ogg", size: 6 } as File;
  const saved = await bounded(saveSoundConfig("machine-10", "electrical", file));
  assert.equal(saved.fileName, "local.ogg");
  const loaded = await bounded(getSoundConfig("machine-10", "electrical"));
  assert.equal(loaded?.id, saved.id);
  assert.equal(closeCount, 3, "each transaction must close its own DB connection");
  assert.equal(completeCount, 3, "all transactions must settle before returning");
});
