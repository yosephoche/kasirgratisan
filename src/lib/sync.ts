import { db } from './db';
import { syncStoreData, fetchPullSync, SyncPayload, hasCloudToken } from './cloud-api';

var syncDebounceTimer: any = null;
var isSyncing = false;

// Urutan & nama harus identik dengan `SYNC_TABLES` backend (`app/sync_tables.py`).
const SYNC_TABLE_NAMES = [
  'categories', 'products', 'suppliers', 'units', 'paymentMethods', 'customers', 'users',
  'transactions', 'transactionItems', 'stockIns', 'stockOuts', 'hppHistory',
  'expenseCategories', 'expenses', 'debts', 'debtPayments', 'stockOpnames', 'stockOpnameItems',
  'productRecipes', 'overheadConfig', 'materials',
];

// Field bertipe Date per tabel (harus sinkron dgn map di `sanitizeDatabaseDates()` — db.ts).
// Tabel anak (`transactionItems`/`stockOpnameItems`) tidak punya kolom updatedAt/syncedAt sendiri.
const SYNC_TABLE_DATE_FIELDS: Record<string, string[]> = {
  categories: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  products: ['createdAt', 'updatedAt', 'deletedAt', 'syncedAt'],
  suppliers: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  units: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  paymentMethods: ['createdAt', 'updatedAt', 'syncedAt'],
  customers: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  users: ['createdAt', 'lastLoginAt', 'updatedAt', 'syncedAt'],
  transactions: ['date', 'openedAt', 'closedAt', 'updatedAt', 'syncedAt'],
  transactionItems: [],
  stockIns: ['date', 'updatedAt', 'syncedAt'],
  stockOuts: ['date', 'updatedAt', 'syncedAt'],
  hppHistory: ['date', 'updatedAt', 'syncedAt'],
  expenseCategories: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  expenses: ['date', 'createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  debts: ['createdAt', 'settledAt', 'updatedAt', 'syncedAt'],
  debtPayments: ['date', 'updatedAt', 'syncedAt'],
  stockOpnames: ['date', 'updatedAt', 'syncedAt'],
  stockOpnameItems: [],
  productRecipes: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
  overheadConfig: ['deletedAt', 'updatedAt', 'syncedAt'],
  materials: ['createdAt', 'deletedAt', 'updatedAt', 'syncedAt'],
};

/**
 * Pemicu sinkronisasi otomatis ke cloud (push lalu pull) dengan mekanisme debounce dan locking.
 */
export function triggerBackgroundSync() {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(async () => {
    if (isSyncing) return;

    try {
      const storeSettings = await db.storeSettings.toCollection().first();
      if (storeSettings && storeSettings.cloudStoreId && hasCloudToken()) {
        isSyncing = true;
        console.log('[Sync] Memulai background sync untuk toko:', storeSettings.cloudStoreId);
        const pushResult = await pushSyncData(storeSettings.cloudStoreId);
        console.log('[Sync] Push selesai:', pushResult.message);
        const pullResult = await pullSyncData(storeSettings.cloudStoreId);
        console.log('[Sync] Pull selesai:', pullResult.message);
      }
    } catch (err) {
      console.warn('[Sync] Background sync gagal:', err);
    } finally {
      isSyncing = false;
    }
  }, 2000); // debounce 2 detik
}

/**
 * Fungsi inti untuk melakukan PUSH data lokal yang kotor (dirty) ke cloud.
 */
export async function pushSyncData(storeId: string): Promise<{ success: boolean; message: string }> {
  try {
    const storeSettings = await db.storeSettings.toCollection().first();
    const deviceId = storeSettings?.deviceId ?? '';

    // 1. Ambil data lokal yang berubah (updatedAt > syncedAt atau syncedAt === null)
    const getDirtyRecords = async (tableName: string) => {
      const table = db.table(tableName);
      return table.filter(item => {
        if (!item.syncedAt) return true;
        if (!item.updatedAt) return false;
        return new Date(item.updatedAt).getTime() > new Date(item.syncedAt).getTime();
      }).toArray();
    };

    const categories = await getDirtyRecords('categories');
    const products = await getDirtyRecords('products');
    const suppliers = await getDirtyRecords('suppliers');
    const units = await getDirtyRecords('units');
    const paymentMethods = await getDirtyRecords('paymentMethods');
    const customers = await getDirtyRecords('customers');
    const users = await getDirtyRecords('users');
    const transactions = await getDirtyRecords('transactions');
    const stockIns = await getDirtyRecords('stockIns');
    const stockOuts = await getDirtyRecords('stockOuts');
    const hppHistory = await getDirtyRecords('hppHistory');
    const expenseCategories = await getDirtyRecords('expenseCategories');
    const expenses = await getDirtyRecords('expenses');
    const debts = await getDirtyRecords('debts');
    const debtPayments = await getDirtyRecords('debtPayments');
    const stockOpnames = await getDirtyRecords('stockOpnames');
    const productRecipes = await getDirtyRecords('productRecipes');
    const overheadConfig = await getDirtyRecords('overheadConfig');
    const materials = await getDirtyRecords('materials');

    // 2. Ambil detail records yang berelasi dengan data induk yang kotor
    const dirtyTxIds = transactions.map(t => t.id).filter(id => id !== undefined) as number[];
    const transactionItems = dirtyTxIds.length > 0
      ? await db.transactionItems.where('transactionId').anyOf(dirtyTxIds).toArray()
      : [];

    const dirtyOpnameIds = stockOpnames.map(o => o.id).filter(id => id !== undefined) as number[];
    const stockOpnameItems = dirtyOpnameIds.length > 0
      ? await db.stockOpnameItems.where('opnameId').anyOf(dirtyOpnameIds).toArray()
      : [];

    const totalDirtyCount =
      categories.length + products.length + suppliers.length + units.length +
      paymentMethods.length + customers.length + users.length +
      transactions.length + transactionItems.length + stockIns.length + stockOuts.length +
      hppHistory.length + expenseCategories.length +
      expenses.length + debts.length + debtPayments.length + stockOpnames.length + stockOpnameItems.length +
      productRecipes.length + overheadConfig.length + materials.length;

    if (totalDirtyCount === 0) {
      return { success: true, message: 'Semua data lokal sudah sinkron.' };
    }

    console.log(`[Sync] Mengirimkan ${totalDirtyCount} data kotor ke server...`);

    // 3. Bangun payload push
    const payload: SyncPayload = {
      categories,
      products,
      suppliers,
      units,
      paymentMethods,
      customers,
      users,
      transactions,
      transactionItems,
      stockIns,
      stockOuts,
      hppHistory,
      expenseCategories,
      expenses,
      debts,
      debtPayments,
      stockOpnames,
      stockOpnameItems,
      productRecipes,
      overheadConfig,
      materials
    };

    // 4. Kirim ke API cloud sync
    const response = await syncStoreData(storeId, payload, deviceId);

    // 5. Perbarui status syncedAt di lokal ke waktu sekarang
    const syncTime = new Date();
    await db.transaction('rw', [
      'categories', 'products', 'suppliers', 'units', 'paymentMethods', 'customers', 'users', 'transactions',
      'stockIns', 'stockOuts', 'hppHistory',
      'expenseCategories', 'expenses', 'debts', 'debtPayments', 'stockOpnames',
      'productRecipes', 'overheadConfig', 'materials'
    ], async () => {
      const updateSyncTime = async (tableName: string, records: any[]) => {
        const table = db.table(tableName);
        for (const record of records) {
          if (record.id !== undefined) {
            await table.update(record.id, { syncedAt: syncTime });
          }
        }
      };

      await updateSyncTime('categories', categories);
      await updateSyncTime('products', products);
      await updateSyncTime('suppliers', suppliers);
      await updateSyncTime('units', units);
      await updateSyncTime('paymentMethods', paymentMethods);
      await updateSyncTime('customers', customers);
      await updateSyncTime('users', users);
      await updateSyncTime('transactions', transactions);
      await updateSyncTime('stockIns', stockIns);
      await updateSyncTime('stockOuts', stockOuts);
      await updateSyncTime('hppHistory', hppHistory);
      await updateSyncTime('expenseCategories', expenseCategories);
      await updateSyncTime('expenses', expenses);
      await updateSyncTime('debts', debts);
      await updateSyncTime('debtPayments', debtPayments);
      await updateSyncTime('stockOpnames', stockOpnames);
      await updateSyncTime('productRecipes', productRecipes);
      await updateSyncTime('overheadConfig', overheadConfig);
      await updateSyncTime('materials', materials);
    });

    return { success: true, message: response.message || 'Sinkronisasi berhasil.' };
  } catch (err) {
    console.error('[Sync] Gagal push data:', err);
    throw err;
  }
}

function coerceRecordDates(record: any, dateFields: string[]) {
  const out = { ...record };
  for (const field of dateFields) {
    if (typeof out[field] === 'string') {
      const parsed = new Date(out[field]);
      if (!isNaN(parsed.getTime())) out[field] = parsed;
    }
  }
  return out;
}

/**
 * Fungsi inti untuk melakukan PULL perubahan dari cloud sejak `lastPulledAt`, merge ke Dexie lokal.
 * Last-write-wins berbasis `updatedAt`: record lokal yang lebih baru & belum ter-push tidak ditimpa.
 */
export async function pullSyncData(storeId: string): Promise<{ success: boolean; message: string; applied: number }> {
  try {
    const storeSettings = await db.storeSettings.toCollection().first();
    const since = storeSettings?.lastPulledAt ? new Date(storeSettings.lastPulledAt).toISOString() : undefined;

    const response = await fetchPullSync(storeId, since);
    const serverTime = new Date(response.serverTime);
    let applied = 0;

    await db.transaction('rw', [...SYNC_TABLE_NAMES, 'storeSettings'], async () => {
      for (const tableName of SYNC_TABLE_NAMES) {
        const records = response.changes[tableName] ?? [];
        if (records.length === 0) continue;

        const table = db.table(tableName);
        const dateFields = SYNC_TABLE_DATE_FIELDS[tableName] ?? [];
        const hasUpdatedAt = dateFields.includes('updatedAt');

        for (const raw of records) {
          if (raw.id === undefined || raw.id === null) continue;
          const coerced = coerceRecordDates(raw, dateFields);

          if (hasUpdatedAt) {
            const existing = await table.get(coerced.id);
            const incomingTime = coerced.updatedAt instanceof Date ? coerced.updatedAt.getTime() : 0;
            const existingTime = existing?.updatedAt instanceof Date ? existing.updatedAt.getTime() : -Infinity;
            if (existing && existingTime > incomingTime) continue; // lokal lebih baru & belum ter-push, jangan ditimpa
            coerced.syncedAt = serverTime;
          }

          await table.put(coerced);
          applied++;
        }
      }

      if (storeSettings?.id) {
        await db.storeSettings.update(storeSettings.id, { lastPulledAt: serverTime });
      }
    });

    return {
      success: true,
      applied,
      message: applied > 0 ? `${applied} data diterima dari cloud.` : 'Tidak ada data baru dari cloud.',
    };
  } catch (err) {
    console.error('[Sync] Gagal pull data:', err);
    throw err;
  }
}
