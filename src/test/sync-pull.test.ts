import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { pullSyncData } from '@/lib/sync';
import * as cloudApi from '@/lib/cloud-api';

vi.mock('@/lib/cloud-api', async () => {
  const actual = await vi.importActual<typeof cloudApi>('@/lib/cloud-api');
  return {
    ...actual,
    fetchPullSync: vi.fn(),
  };
});

describe('Incremental Data Sync PULL', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.products.clear();
    await db.categories.clear();
    await db.storeSettings.clear();

    await db.storeSettings.add({
      storeName: 'Test Sync Store',
      address: '',
      phone: '',
      receiptFooter: '',
      printLogo: false,
      onboardingDone: true,
      lastBackupAt: null,
      deviceId: 'test-device-id',
      cloudStoreId: 'test-cloud-store-id',
    });
  });

  afterEach(async () => {
    await db.products.clear();
    await db.categories.clear();
    await db.storeSettings.clear();
  });

  it('should merge new remote records into Dexie and advance lastPulledAt', async () => {
    const mockFetchPullSync = vi.mocked(cloudApi.fetchPullSync);
    mockFetchPullSync.mockResolvedValue({
      serverTime: '2026-08-08T10:00:00.000Z',
      changes: {
        categories: [
          { id: 99, name: 'Dari Device Lain', color: '#000000', icon: '📦', createdAt: '2026-08-08T09:00:00.000Z', updatedAt: '2026-08-08T09:00:00.000Z', isDeleted: 0, deletedAt: null },
        ],
        products: [],
        suppliers: [], units: [], paymentMethods: [], customers: [], users: [],
        transactions: [], transactionItems: [], stockIns: [], stockOuts: [], hppHistory: [],
        expenseCategories: [], expenses: [], debts: [], debtPayments: [], stockOpnames: [], stockOpnameItems: [],
        productRecipes: [], overheadConfig: [], materials: [],
      },
    });

    const result = await pullSyncData('test-cloud-store-id');
    expect(result.success).toBe(true);
    expect(result.applied).toBe(1);

    const category = await db.categories.get(99);
    expect(category?.name).toBe('Dari Device Lain');
    expect(category?.updatedAt).toBeInstanceOf(Date);
    expect(category?.syncedAt).toBeInstanceOf(Date);

    const settings = await db.storeSettings.toCollection().first();
    expect(settings?.lastPulledAt).toBeInstanceOf(Date);
    expect(settings?.lastPulledAt?.toISOString()).toBe('2026-08-08T10:00:00.000Z');

    expect(mockFetchPullSync).toHaveBeenCalledWith('test-cloud-store-id', undefined);
  });

  it('should not overwrite a local record that is newer and not yet pushed', async () => {
    const localId = await db.categories.add({
      name: 'Versi Lokal Terbaru',
      color: '#111111',
      icon: '🆕',
      createdAt: new Date('2026-08-08T08:00:00.000Z'),
      isDeleted: 0,
      deletedAt: null,
    });
    // Simulasikan edit lokal belum ter-push (updatedAt > incoming, syncedAt null)
    await db.categories.update(localId, { updatedAt: new Date('2026-08-08T11:00:00.000Z'), syncedAt: null });

    const mockFetchPullSync = vi.mocked(cloudApi.fetchPullSync);
    mockFetchPullSync.mockResolvedValue({
      serverTime: '2026-08-08T10:00:00.000Z',
      changes: {
        categories: [
          { id: localId, name: 'Versi Server Basi', color: '#222222', icon: '🕰️', createdAt: '2026-08-08T08:00:00.000Z', updatedAt: '2026-08-08T09:30:00.000Z', isDeleted: 0, deletedAt: null },
        ],
        products: [], suppliers: [], units: [], paymentMethods: [], customers: [], users: [],
        transactions: [], transactionItems: [], stockIns: [], stockOuts: [], hppHistory: [],
        expenseCategories: [], expenses: [], debts: [], debtPayments: [], stockOpnames: [], stockOpnameItems: [],
        productRecipes: [], overheadConfig: [], materials: [],
      },
    });

    const result = await pullSyncData('test-cloud-store-id');
    expect(result.applied).toBe(0);

    const category = await db.categories.get(localId);
    expect(category?.name).toBe('Versi Lokal Terbaru');
  });

  it('should pass lastPulledAt as since on subsequent pulls', async () => {
    await db.storeSettings.toCollection().modify({ lastPulledAt: new Date('2026-08-01T00:00:00.000Z') });

    const mockFetchPullSync = vi.mocked(cloudApi.fetchPullSync);
    mockFetchPullSync.mockResolvedValue({
      serverTime: '2026-08-08T10:00:00.000Z',
      changes: {
        categories: [], products: [], suppliers: [], units: [], paymentMethods: [], customers: [], users: [],
        transactions: [], transactionItems: [], stockIns: [], stockOuts: [], hppHistory: [],
        expenseCategories: [], expenses: [], debts: [], debtPayments: [], stockOpnames: [], stockOpnameItems: [],
        productRecipes: [], overheadConfig: [], materials: [],
      },
    });

    await pullSyncData('test-cloud-store-id');
    expect(mockFetchPullSync).toHaveBeenCalledWith('test-cloud-store-id', '2026-08-01T00:00:00.000Z');
  });
});
