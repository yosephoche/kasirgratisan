import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import NumberInput from '@/components/NumberInput';
import MaterialPicker from '@/components/MaterialPicker';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface RecipeEditorProps {
  productId: number;
}

export default function RecipeEditor({ productId }: RecipeEditorProps) {
  const { t } = useTranslation('products');
  const [ingredientId, setIngredientId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');

  const rows = useLiveQuery(
    () => db.productRecipes.where({ productId }).filter(r => r.isDeleted === 0).toArray(),
    [productId]
  );
  const materials = useLiveQuery(() => db.materials.where('isDeleted').equals(0).toArray());

  const getMaterial = (id: number) => materials?.find(m => m.id === id);

  const resetForm = () => {
    setIngredientId('');
    setQty('');
    setUnit('');
  };

  const handleAdd = async () => {
    const ingredientMaterialId = Number(ingredientId);
    const quantity = Number(qty);
    if (!ingredientMaterialId || !quantity || quantity <= 0) return;

    if (rows?.some(r => r.ingredientMaterialId === ingredientMaterialId)) {
      toast.error(t('recipe.toastAlreadyAdded'));
      return;
    }

    const now = new Date();
    await db.productRecipes.add({
      productId,
      ingredientMaterialId,
      quantity,
      unit: unit.trim() || getMaterial(ingredientMaterialId)?.unit || '',
      createdAt: now,
      updatedAt: now,
      isDeleted: 0,
      deletedAt: null,
    });
    resetForm();
  };

  const handleRemove = async (id: number) => {
    await db.productRecipes.update(id, {
      isDeleted: 1,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">{t('recipe.title')}</Label>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t('recipe.hint')}</p>
      </div>

      {(rows ?? []).length > 0 && (
        <div className="space-y-1.5">
          {rows!.map(r => {
            const ing = getMaterial(r.ingredientMaterialId);
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ing?.name ?? t('recipe.unknownIngredient')}</p>
                  <p className="text-xs text-muted-foreground">{r.quantity} {r.unit}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive shrink-0"
                  onClick={() => handleRemove(r.id!)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        {materials !== undefined && materials.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('recipe.noMaterialsHint')}</p>
        ) : (
          <MaterialPicker
            materials={materials ?? []}
            value={ingredientId}
            onChange={(id) => {
              setIngredientId(id);
              const m = materials?.find(x => x.id === Number(id));
              if (m) setUnit(m.unit);
            }}
            placeholder={t('recipe.pickIngredient')}
          />
        )}
        {ingredientId && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('recipe.qtyLabel')}</Label>
              <NumberInput value={qty} onChange={setQty} placeholder="0" decimal className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('recipe.unitLabel')}</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} className="h-10" />
            </div>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={handleAdd}
          disabled={!ingredientId || !qty}
        >
          <Plus className="w-3.5 h-3.5" /> {t('recipe.addButton')}
        </Button>
      </div>
    </div>
  );
}
