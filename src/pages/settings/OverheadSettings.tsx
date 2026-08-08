import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { computeOverheadPerUnit } from '@/lib/overhead';
import { Calculator, ChevronLeft, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import NumberInput from '@/components/NumberInput';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import LockedPage from '@/components/LockedPage';
import { toast } from 'sonner';

const NUMBER_LOCALES: Record<string, string> = { id: 'id-ID', en: 'en-US', ms: 'ms-MY' };

export default function OverheadSettings() {
  const { t, i18n } = useTranslation('settings');
  const { can } = useAuth();
  const numberLocale = NUMBER_LOCALES[i18n.language] ?? 'id-ID';
  const config = useLiveQuery(() => db.overheadConfig.where('isDeleted').equals(0).first());

  const [monthlyTargetUnits, setMonthlyTargetUnits] = useState('');
  const [rentPerYear, setRentPerYear] = useState('');
  const [utilitiesPerMonth, setUtilitiesPerMonth] = useState('');
  const [marketingPerMonth, setMarketingPerMonth] = useState('');
  const [insurancePerMonth, setInsurancePerMonth] = useState('');
  const [salariesPerMonth, setSalariesPerMonth] = useState('');
  const [equipmentMaintenancePerMonth, setEquipmentMaintenancePerMonth] = useState('');
  const [depreciationPerMonth, setDepreciationPerMonth] = useState('');
  const [otherPerMonth, setOtherPerMonth] = useState('');

  useEffect(() => {
    if (config) {
      setMonthlyTargetUnits(config.monthlyTargetUnits ? String(config.monthlyTargetUnits) : '');
      setRentPerYear(config.rentPerYear ? String(config.rentPerYear) : '');
      setUtilitiesPerMonth(config.utilitiesPerMonth ? String(config.utilitiesPerMonth) : '');
      setMarketingPerMonth(config.marketingPerMonth ? String(config.marketingPerMonth) : '');
      setInsurancePerMonth(config.insurancePerMonth ? String(config.insurancePerMonth) : '');
      setSalariesPerMonth(config.salariesPerMonth ? String(config.salariesPerMonth) : '');
      setEquipmentMaintenancePerMonth(config.equipmentMaintenancePerMonth ? String(config.equipmentMaintenancePerMonth) : '');
      setDepreciationPerMonth(config.depreciationPerMonth ? String(config.depreciationPerMonth) : '');
      setOtherPerMonth(config.otherPerMonth ? String(config.otherPerMonth) : '');
    }
  }, [config]);

  if (!can('manage_store_settings')) {
    return <LockedPage title={t('overheadSettings.title')} permissionLabel={t('masterData.theme.permissionLabel')} />;
  }

  const preview = {
    monthlyTargetUnits: Number(monthlyTargetUnits) || 0,
    rentPerYear: Number(rentPerYear) || 0,
    utilitiesPerMonth: Number(utilitiesPerMonth) || 0,
    marketingPerMonth: Number(marketingPerMonth) || 0,
    insurancePerMonth: Number(insurancePerMonth) || 0,
    salariesPerMonth: Number(salariesPerMonth) || 0,
    equipmentMaintenancePerMonth: Number(equipmentMaintenancePerMonth) || 0,
    depreciationPerMonth: Number(depreciationPerMonth) || 0,
    otherPerMonth: Number(otherPerMonth) || 0,
  };
  const overheadPerUnit = computeOverheadPerUnit(preview);
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString(numberLocale)}`;

  const handleSave = async () => {
    try {
      if (config?.id) {
        await db.overheadConfig.update(config.id, { ...preview, updatedAt: new Date() });
      } else {
        await db.overheadConfig.add({ ...preview, isDeleted: 0, deletedAt: null, updatedAt: new Date() });
      }
      toast.success(t('overheadSettings.saveSuccess'));
    } catch {
      toast.error(t('overheadSettings.saveFailed'));
    }
  };

  const fields: { key: keyof typeof preview; label: string; hint?: string }[] = [
    { key: 'monthlyTargetUnits', label: t('overheadSettings.monthlyTargetUnitsLabel'), hint: t('overheadSettings.monthlyTargetUnitsHint') },
    { key: 'rentPerYear', label: t('overheadSettings.rentPerYearLabel') },
    { key: 'utilitiesPerMonth', label: t('overheadSettings.utilitiesPerMonthLabel') },
    { key: 'marketingPerMonth', label: t('overheadSettings.marketingPerMonthLabel') },
    { key: 'insurancePerMonth', label: t('overheadSettings.insurancePerMonthLabel') },
    { key: 'salariesPerMonth', label: t('overheadSettings.salariesPerMonthLabel') },
    { key: 'equipmentMaintenancePerMonth', label: t('overheadSettings.equipmentMaintenancePerMonthLabel') },
    { key: 'depreciationPerMonth', label: t('overheadSettings.depreciationPerMonthLabel') },
    { key: 'otherPerMonth', label: t('overheadSettings.otherPerMonthLabel') },
  ];

  const fieldState: Record<string, [string, (v: string) => void]> = {
    monthlyTargetUnits: [monthlyTargetUnits, setMonthlyTargetUnits],
    rentPerYear: [rentPerYear, setRentPerYear],
    utilitiesPerMonth: [utilitiesPerMonth, setUtilitiesPerMonth],
    marketingPerMonth: [marketingPerMonth, setMarketingPerMonth],
    insurancePerMonth: [insurancePerMonth, setInsurancePerMonth],
    salariesPerMonth: [salariesPerMonth, setSalariesPerMonth],
    equipmentMaintenancePerMonth: [equipmentMaintenancePerMonth, setEquipmentMaintenancePerMonth],
    depreciationPerMonth: [depreciationPerMonth, setDepreciationPerMonth],
    otherPerMonth: [otherPerMonth, setOtherPerMonth],
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link to="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          {t('overheadSettings.title')}
        </h1>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">{t('overheadSettings.description')}</p>

      {/* Result Card */}
      <Card className="border-0 shadow-sm bg-primary/5">
        <CardContent className="p-4 text-center space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{t('overheadSettings.resultLabel')}</p>
          <p className="text-2xl font-bold text-primary">{rp(overheadPerUnit)}</p>
          <p className="text-[10px] text-muted-foreground">{t('overheadSettings.resultHint')}</p>
        </CardContent>
      </Card>

      {/* Editor Card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          {fields.map(f => {
            const [value, setValue] = fieldState[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-sm font-semibold">{f.label}</Label>
                <NumberInput value={value} onChange={setValue} placeholder="0" className="h-11" />
                {f.hint && <p className="text-[10px] text-muted-foreground">{f.hint}</p>}
              </div>
            );
          })}

          <Button className="w-full h-11 gap-2" onClick={handleSave}>
            <Save className="w-4 h-4" />
            {t('common:save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
