import { useState } from 'react';
import { Search, Check, X, Boxes } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Material } from '@/lib/db';
import { useTranslation } from 'react-i18next';

const NUMBER_LOCALES: Record<string, string> = {
  id: 'id-ID',
  en: 'en-US',
  ms: 'id-ID',
};

interface MaterialPickerProps {
  materials: Material[];
  value: string;
  onChange: (id: string) => void;
  filter?: (m: Material) => boolean;
  placeholder?: string;
  showCost?: boolean;
}

export default function MaterialPicker({
  materials,
  value,
  onChange,
  filter,
  placeholder,
  showCost = false,
}: MaterialPickerProps) {
  const { t, i18n } = useTranslation('settings');
  const numberLocale = NUMBER_LOCALES[i18n.language] || 'id-ID';
  const [query, setQuery] = useState('');

  const available = filter ? materials.filter(filter) : materials;
  const selected = materials.find(m => m.id === Number(value));

  const q = query.trim().toLowerCase();
  const matches = available.filter(m => m.name.toLowerCase().includes(q));

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-primary/5 border-primary/30 p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground">
            {t('material.card.stock', { stock: selected.stock, unit: selected.unit })}
          </p>
          {showCost && (
            <p className="text-xs text-muted-foreground">
              {t('material.card.cost', { cost: selected.costPerUnit.toLocaleString(numberLocale) })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => { onChange(''); setQuery(''); }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={placeholder ?? t('products:recipe.pickIngredient')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-11 pl-9"
        />
      </div>

      {q && (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-popover shadow-lg divide-y">
        {matches.length === 0 ? (
          <div className="text-center py-8">
            <Boxes className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">{t('productPicker.notFound')}</p>
          </div>
        ) : (
          matches.map(m => (
            <button
              type="button"
              key={m.id}
              onClick={() => { onChange(m.id!.toString()); setQuery(''); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/60 active:bg-muted"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {t('material.card.stock', { stock: m.stock, unit: m.unit })}
              </span>
            </button>
          ))
        )}
      </div>
      )}
    </div>
  );
}
