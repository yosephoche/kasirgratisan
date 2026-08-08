import type { OverheadConfig, Product } from './db';

type OverheadCostInputs = Pick<
  OverheadConfig,
  | 'rentPerYear'
  | 'utilitiesPerMonth'
  | 'marketingPerMonth'
  | 'insurancePerMonth'
  | 'salariesPerMonth'
  | 'equipmentMaintenancePerMonth'
  | 'depreciationPerMonth'
  | 'otherPerMonth'
>;

type OverheadInputs = OverheadCostInputs & Pick<OverheadConfig, 'monthlyTargetUnits'>;

/** Total biaya overhead bulanan (aktual) dari seluruh komponen fix cost. */
export function computeTotalOverheadPerMonth(config: OverheadCostInputs): number {
  return (
    config.rentPerYear / 12 +
    config.utilitiesPerMonth +
    config.marketingPerMonth +
    config.insurancePerMonth +
    config.salariesPerMonth +
    config.equipmentMaintenancePerMonth +
    config.depreciationPerMonth +
    (config.otherPerMonth ?? 0)
  );
}

/**
 * Predetermined overhead rate (absorption costing, basis unit): total biaya
 * overhead bulanan dibagi target penjualan bulanan. Lihat PLAN.md §H.6.
 */
export function computeOverheadPerUnit(config: OverheadInputs): number {
  const totalOverheadBulanan = computeTotalOverheadPerMonth(config);
  return config.monthlyTargetUnits > 0 ? totalOverheadBulanan / config.monthlyTargetUnits : 0;
}

/**
 * Overhead per porsi untuk sebuah produk: override per produk bila diisi
 * (`fixed` = Rp tetap, `percent` = persen dari biaya bahan), else default global
 * `overheadPerUnit` (hasil `computeOverheadPerUnit`). Lihat PLAN.md §H.7.
 */
export function resolveOverhead(
  product: Pick<Product, 'overheadCost' | 'overheadMode'>,
  biayaBahan: number,
  overheadPerUnit: number
): number {
  if (product.overheadCost != null) {
    return product.overheadMode === 'percent'
      ? biayaBahan * (product.overheadCost / 100)
      : product.overheadCost;
  }
  return overheadPerUnit;
}
