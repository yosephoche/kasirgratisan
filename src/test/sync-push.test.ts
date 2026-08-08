import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { pushSyncData, triggerBackgroundSync } from '@/lib/sync';
import * as cloudApi from '@/lib/cloud-api';

vi.mock('@/lib/cloud-api', async () => {
  const actual = await vi.importActual<typeof cloudApi>('@/lib/cloud-api');
  return {
    ...actual,
    syncStoreData: vi.fn(),
    hasCloudToken: vi.fn(),
  };
});

describe('Incremental Data Sync PUSH', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.products.clear();
    await db.categories.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.storeSettings.clear();

    // Setup default store settings
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
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.storeSettings.clear();
  });

  it('should push only dirty records and update syncedAt on success', async () => {
    // 1. Add some records
    const categoryId = await db.categories.add({
      name: 'Sync Category',
      color: '#FF0000',
      icon: '📁',
      createdAt: new Date(),
      isDeleted: 0,
      deletedAt: null,
    });

    const productId = await db.products.add({
      name: 'Sync Product',
      sku: 'SYNCP001',
      categoryId,
      price: 15000,
      hpp: 9000,
      stock: 20,
      unit: 'pcs',
      isDeleted: 0,
      deletedAt: null,
      createdAt: new Date(),
    });

    // 2. Set mock return value
    const mockSyncStoreData = vi.mocked(cloudApi.syncStoreData);
    mockSyncStoreData.mockResolvedValue({ message: 'Sync OK' });

    // 3. Execute push sync
    const result = await pushSyncData('test-cloud-store-id');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Sync OK');

    // 4. Verify mock was called with correct payload
    expect(mockSyncStoreData).toHaveBeenCalledTimes(1);
    const [storeId, payload, deviceId] = mockSyncStoreData.mock.calls[0];
    expect(storeId).toBe('test-cloud-store-id');
    expect(deviceId).toBe('test-device-id');
    expect(payload.categories).toHaveLength(1);
    expect(payload.categories?.[0].id).toBe(categoryId);
    expect(payload.products).toHaveLength(1);
    expect(payload.products?.[0].id).toBe(productId);

    // 5. Verify local syncedAt fields are updated
    const updatedCategory = await db.categories.get(categoryId);
    const updatedProduct = await db.products.get(productId);
    expect(updatedCategory?.syncedAt).toBeInstanceOf(Date);
    expect(updatedProduct?.syncedAt).toBeInstanceOf(Date);

    // 6. Running sync again should not send anything (no dirty records)
    vi.clearAllMocks();
    const secondResult = await pushSyncData('test-cloud-store-id');
    expect(secondResult.success).toBe(true);
    expect(secondResult.message).toContain('sinkron');
    expect(mockSyncStoreData).not.toHaveBeenCalled();
  });

  it('should include transaction items when pushing dirty transactions', async () => {
    const txId = await db.transactions.add({
      subtotal: 30000,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: 30000,
      paymentMethodId: 1,
      paymentAmount: 50000,
      change: 20000,
      profit: 10000,
      date: new Date(),
      receiptNumber: 'TX-TEST-001',
      status: 'completed',
    });

    const itemId = await db.transactionItems.add({
      transactionId: txId,
      productId: 1,
      productName: 'Sync Product',
      quantity: 2,
      price: 15000,
      hpp: 10000,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      subtotal: 30000,
    });

    const mockSyncStoreData = vi.mocked(cloudApi.syncStoreData);
    mockSyncStoreData.mockResolvedValue({ message: 'Sync OK' });

    await pushSyncData('test-cloud-store-id');

    expect(mockSyncStoreData).toHaveBeenCalledTimes(1);
    const payload = mockSyncStoreData.mock.calls[0][1];
    expect(payload.transactions).toHaveLength(1);
    expect(payload.transactions?.[0].id).toBe(txId);
    expect(payload.transactionItems).toHaveLength(1);
    expect(payload.transactionItems?.[0].id).toBe(itemId);
  });
});
