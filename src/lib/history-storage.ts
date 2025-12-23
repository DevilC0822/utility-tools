// 转换历史记录存储模块 - 使用 IndexedDB 保存原图质量

export interface HistoryRecord {
  id: string;
  fileName: string;
  originalImage: string; // 原图 Base64
  processedImage: string; // 处理后图片 Base64
  width: number;
  height: number;
  watermarkSize: number;
  createdAt: number;
}

const DB_NAME = "utility-tools-gemini-watermark";
const DB_VERSION = 1;
const STORE_NAME = "history";
const MAX_RECORDS = 50;

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };
  });

  return dbInitPromise;
}

export async function getHistory(): Promise<HistoryRecord[]> {
  if (typeof window === "undefined") return [];

  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("createdAt");

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, "prev");
      const records: HistoryRecord[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          records.push(cursor.value);
          cursor.continue();
        } else {
          resolve(records);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("获取历史记录失败:", error);
    return [];
  }
}

export async function addHistory(
  record: Omit<HistoryRecord, "id" | "createdAt">
): Promise<HistoryRecord> {
  const newRecord: HistoryRecord = {
    id: generateId(),
    ...record,
    createdAt: Date.now(),
  };

  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.add(newRecord);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await cleanupOldRecords();
  } catch (error) {
    console.error("添加历史记录失败:", error);
  }

  return newRecord;
}

async function cleanupOldRecords(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("createdAt");

    const request = index.openCursor(null, "next");
    const recordIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          recordIds.push(cursor.value.id);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    if (recordIds.length > MAX_RECORDS) {
      const toDelete = recordIds.slice(0, recordIds.length - MAX_RECORDS);
      const deleteTx = db.transaction(STORE_NAME, "readwrite");
      const deleteStore = deleteTx.objectStore(STORE_NAME);

      for (const id of toDelete) {
        deleteStore.delete(id);
      }

      await new Promise<void>((resolve, reject) => {
        deleteTx.oncomplete = () => resolve();
        deleteTx.onerror = () => reject(deleteTx.error);
      });
    }
  } catch (error) {
    console.error("清理旧记录失败:", error);
  }
}

export async function deleteHistory(id: string): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("删除历史记录失败:", error);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("清空历史记录失败:", error);
  }
}

export function formatTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
