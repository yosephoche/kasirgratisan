import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Material } from '@/lib/db';
import { useState } from 'react';
import { Boxes, Plus, Edit2, Trash2, Search, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import NumberInput from '@/components/NumberInput';
import SearchableSelect from '@/components/SearchableSelect';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import LockedPage from '@/components/LockedPage';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const NUMBER_LOCALES: Record<string, string> = { id: 'id-ID', en: 'en-US', ms: 'ms-MY' };

export default function MaterialsPage() {
  const navigate = useNavigate();
  const { currentUser, can } = useAuth();
  const { t, i18n } = useTranslation('settings');
  const numberLocale = NUMBER_LOCALES[i18n.language] ?? 'id-ID';

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ingredient' | 'packaging'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'ingredient' | 'packaging'>('ingredient');
  const [unit, setUnit] = useState('pcs');
  const [stock, setStock] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [notes, setNotes] = useState('');

  const materials = useLiveQuery(() => db.materials.where('isDeleted').equals(0).toArray());
  const units = useLiveQuery(() => db.units.where('isDeleted').equals(0).toArray());

  const unitOptions = (() => {
    const names = (units ?? []).map(u => u.name);
    if (unit && !names.includes(unit)) names.push(unit);
    return names;
  })();

  if (!can('manage_stock_inout')) {
    return <LockedPage title={t('material.locked.title')} permissionLabel={t('material.locked.permissionLabel')} />;
  }

  const filtered = materials?.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || m.type === filterType;
    return matchSearch && matchType;
  }) ?? [];

  const openAdd = () => {
    setEditMaterial(null);
    setName(''); setType('ingredient'); setUnit(units?.[0]?.name ?? 'pcs'); setStock(''); setCostPerUnit(''); setNotes('');
    setDialogOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditMaterial(m);
    setName(m.name); setType(m.type); setUnit(m.unit); setStock(m.stock.toString()); setCostPerUnit(m.costPerUnit.toString()); setNotes(m.notes ?? '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      type,
      unit: unit.trim() || 'pcs',
      stock: Number(stock) || 0,
      costPerUnit: Number(costPerUnit) || 0,
      notes: notes.trim() || undefined,
      updatedAt: new Date(),
      updatedBy: currentUser?.id,
    };

    if (editMaterial?.id) {
      await db.materials.update(editMaterial.id, data);
      toast.success(t('material.toast.updated'));
    } else {
      await db.materials.add({
        ...data,
        createdAt: new Date(),
        createdBy: currentUser?.id,
        isDeleted: 0,
        deletedAt: null,
      } as Material);
      toast.success(t('material.toast.added'));
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await db.materials.update(deleteId, { isDeleted: 1, deletedAt: new Date(), updatedBy: currentUser?.id });
      setDeleteId(null);
      toast.success(t('material.toast.deleted'));
    }
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/settings')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary" />
            {t('material.title')}
          </h1>
        </div>
        <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
          <Plus className="w-4 h-4" /> {t('material.add')}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={t('material.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
      </div>

      <Tabs value={filterType} onValueChange={v => setFilterType(v as 'all' | 'ingredient' | 'packaging')}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">{t('material.type.all')}</TabsTrigger>
          <TabsTrigger value="ingredient" className="flex-1">{t('material.type.ingredient')}</TabsTrigger>
          <TabsTrigger value="packaging" className="flex-1">{t('material.type.packaging')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="text-xs text-muted-foreground">{t('material.count', { count: filtered.length })}</p>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Boxes className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('material.empty.title')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> {t('material.empty.add')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <Card key={m.id} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{m.name}</h3>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {m.type === 'ingredient' ? t('material.type.ingredient') : t('material.type.packaging')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs font-medium bg-success/10 text-success px-2 py-0.5 rounded">
                        {t('material.card.stock', { stock: m.stock, unit: m.unit })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('material.card.cost', { cost: m.costPerUnit.toLocaleString(numberLocale) })}
                      </span>
                    </div>
                    {m.notes && <p className="text-xs text-muted-foreground mt-1 italic">{m.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(m.id!)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl">
          <DialogHeader><DialogTitle>{editMaterial ? t('material.dialog.editTitle') : t('material.dialog.addTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>{t('material.dialog.nameLabel')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('material.dialog.namePlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('material.dialog.typeLabel')}</Label>
              <Tabs value={type} onValueChange={v => setType(v as 'ingredient' | 'packaging')}>
                <TabsList className="w-full">
                  <TabsTrigger value="ingredient" className="flex-1">{t('material.type.ingredient')}</TabsTrigger>
                  <TabsTrigger value="packaging" className="flex-1">{t('material.type.packaging')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('material.dialog.unitLabel')}</Label>
                <SearchableSelect
                  value={unit}
                  onChange={setUnit}
                  placeholder={t('material.dialog.unitLabel')}
                  options={unitOptions.length === 0 ? [{ value: 'pcs', label: 'pcs' }] : unitOptions.map(u => ({ value: u, label: u }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('material.dialog.stockLabel')}</Label>
                <NumberInput value={stock} onChange={setStock} placeholder="0" className="h-11" decimal />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('material.dialog.costLabel')}</Label>
              <NumberInput value={costPerUnit} onChange={setCostPerUnit} placeholder="0" className="h-11" />
              <p className="text-[10px] text-muted-foreground">{t('material.dialog.costHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('material.dialog.notesLabel')}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('material.dialog.notesPlaceholder')} rows={2} />
            </div>
            <Button className="w-full h-11" onClick={handleSave} disabled={!name.trim()}>{t('material.dialog.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('material.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('material.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('material.deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('material.deleteDialog.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
