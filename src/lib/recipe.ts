import { db, isStockManaged, type Product, type ProductRecipe, type Material } from './db';
import { resolveOverhead } from './overhead';

export interface RecipeCalcContext {
  recipesByProductId: Map<number, ProductRecipe[]>;
  materialsById: Map<number, Material>;
}

/** Susun lookup cepat dari daftar resep aktif & material untuk `getAvailableQty`/`computeHppFinal`. */
export function buildRecipeCalcContext(recipes: ProductRecipe[], materials: Material[]): RecipeCalcContext {
  const recipesByProductId = new Map<number, ProductRecipe[]>();
  for (const r of recipes) {
    if (r.isDeleted) continue;
    const list = recipesByProductId.get(r.productId);
    if (list) list.push(r); else recipesByProductId.set(r.productId, [r]);
  }
  return {
    recipesByProductId,
    materialsById: new Map(materials.filter(m => m.id !== undefined).map(m => [m.id!, m])),
  };
}

/**
 * Stok tersedia untuk dijual. Produk ber-resep = min(floor(stok_bahan_i / takaran_i))
 * atas seluruh bahan (material selalu dikelola stoknya). Produk tanpa resep aktif =
 * stok sendiri (Infinity bila trackStock:false, perilaku lama).
 */
export function getAvailableQty(product: Product, ctx: RecipeCalcContext): number {
  const recipes = ctx.recipesByProductId.get(product.id!) ?? [];
  if (recipes.length === 0) {
    return isStockManaged(product) ? product.stock : Infinity;
  }
  let min = Infinity;
  for (const r of recipes) {
    const material = ctx.materialsById.get(r.ingredientMaterialId);
    if (!material) continue;
    const avail = Math.floor(material.stock / r.quantity);
    if (avail < min) min = avail;
  }
  return min;
}

/**
 * Biaya bahan per 1 unit produk jadi: Σ(costPerUnit_bahan_i × takaran_i) atas resep
 * aktif. Produk tanpa resep aktif = HPP produk itu sendiri (perilaku lama).
 */
export function computeBiayaBahan(product: Product, ctx: RecipeCalcContext): number {
  const recipes = ctx.recipesByProductId.get(product.id!) ?? [];
  if (recipes.length === 0) return product.hpp;
  return recipes.reduce((sum, r) => {
    const material = ctx.materialsById.get(r.ingredientMaterialId);
    return sum + (material?.costPerUnit ?? 0) * r.quantity;
  }, 0);
}

/**
 * HPP final = biayaBahan + overhead (override per produk bila ada, else default
 * global `overheadPerUnit` dari Overhead Workspace). Dipakai untuk `profit` &
 * snapshot HPP di `transactionItems` saat checkout — lihat PLAN.md §H.7.
 */
export function computeHppFinal(product: Product, ctx: RecipeCalcContext, overheadPerUnit: number): number {
  const biayaBahan = computeBiayaBahan(product, ctx);
  return biayaBahan + resolveOverhead(product, biayaBahan, overheadPerUnit);
}

/**
 * Sesuaikan stok akibat perubahan qty terjual sebuah produk (resep-aware).
 * `deltaQty` > 0 = qty terjual bertambah (stok berkurang); < 0 = berkurang/dibatalkan
 * (stok dikembalikan). Produk tanpa resep aktif berkurang flat 1:1 pada stok produk
 * sendiri (perilaku lama); produk ber-resep mengurangi stok tiap material bahan
 * sesuai takaran × deltaQty.
 */
export async function applyRecipeAwareStockDelta(productId: number, deltaQty: number) {
  if (deltaQty === 0) return;

  const recipes = await db.productRecipes
    .where('productId')
    .equals(productId)
    .filter(r => r.isDeleted === 0)
    .toArray();

  if (recipes.length === 0) {
    const product = await db.products.get(productId);
    if (product && isStockManaged(product)) {
      await db.products.update(productId, { stock: product.stock - deltaQty, updatedAt: new Date() });
    }
    return;
  }

  for (const r of recipes) {
    const material = await db.materials.get(r.ingredientMaterialId);
    if (material) {
      await db.materials.update(material.id!, { stock: material.stock - deltaQty * r.quantity, updatedAt: new Date() });
    }
  }
}
