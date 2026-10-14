import type { HistorySnapshot, SnapshotReason } from '../../types/history';

const DB_NAME = 'bamboo_local_history_db';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // 建立索引加速依檔案路徑/分頁檢索
        store.createIndex('fileKey', 'fileKey', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('fileKey_timestamp', ['fileKey', 'timestamp'], { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[LocalHistory] IndexedDB open failed:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * 寫入一筆新的歷史快照
 */
export async function recordSnapshot(entry: {
  fileKey: string;
  title: string;
  content: string;
  reason: SnapshotReason;
  label?: string;
  summary?: string;
}): Promise<HistorySnapshot | null> {
  try {
    const db = await getDb();
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const lineCount = entry.content.split('\n').length;
    const charCount = entry.content.length;

    const snapshot: HistorySnapshot = {
      id,
      fileKey: entry.fileKey,
      title: entry.title,
      timestamp: Date.now(),
      content: entry.content,
      charCount,
      lineCount,
      reason: entry.reason,
      label: entry.label,
      summary: entry.summary,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(snapshot);

      req.onsuccess = () => {
        resolve(snapshot);
      };

      req.onerror = () => {
        console.error('[LocalHistory] Failed to add snapshot:', req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.error('[LocalHistory] Error recording snapshot:', err);
    return null;
  }
}

/**
 * 取得指定檔案/分頁的所有歷史快照（依時間降冪排序，最新在前）
 */
export async function getSnapshotsForFile(fileKey: string): Promise<HistorySnapshot[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('fileKey');
      const req = index.getAll(fileKey);

      req.onsuccess = () => {
        const results = (req.result || []) as HistorySnapshot[];
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  } catch (err) {
    console.error('[LocalHistory] Error fetching snapshots:', err);
    return [];
  }
}

/**
 * 替特定快照加上自訂標籤 (Put Label)
 */
export async function updateSnapshotLabel(id: string, label: string): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const item = req.result as HistorySnapshot | undefined;
        if (!item) {
          resolve(false);
          return;
        }
        item.label = label;
        const updateReq = store.put(item);
        updateReq.onsuccess = () => resolve(true);
        updateReq.onerror = () => reject(updateReq.error);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[LocalHistory] Error updating label:', err);
    return false;
  }
}

/**
 * 刪除單筆快照
 */
export async function deleteSnapshot(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[LocalHistory] Error deleting snapshot:', err);
    return false;
  }
}

/**
 * 清理過多快照（保留每個檔案最新的 N 筆）
 */
export async function pruneOldSnapshots(fileKey: string, keepCount = 100): Promise<void> {
  try {
    const snapshots = await getSnapshotsForFile(fileKey);
    if (snapshots.length <= keepCount) return;

    // 保留有特殊標籤者，清除最舊且無標籤的快照
    const toPrune = snapshots
      .slice(keepCount)
      .filter((s) => !s.label && s.reason !== 'label');

    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const snap of toPrune) {
      store.delete(snap.id);
    }
  } catch (err) {
    console.warn('[LocalHistory] Failed to prune old snapshots:', err);
  }
}
