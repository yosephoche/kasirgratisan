import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, XCircle, Store } from 'lucide-react';
import { db } from '@/lib/db';
import { redeemStoreInvite, CloudApiError } from '@/lib/cloud-api';
import { applyPullResponse } from '@/lib/sync';
import { markAllFeaturesSeen } from '@/lib/whats-new';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type JoinState = 'confirming' | 'loading' | 'success' | 'error';

export default function JoinStore() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('join');
  const [state, setState] = useState<JoinState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const startedRef = useRef(false);

  const redeem = async () => {
    if (!token) {
      setState('error');
      setErrorMsg(t('invalidToken'));
      return;
    }
    setState('loading');
    try {
      const response = await redeemStoreInvite(token);
      await applyPullResponse(response);

      const existing = await db.storeSettings.toCollection().first();
      const patch = {
        cloudStoreId: response.storeId,
        onboardingDone: true,
        multiUserEnabled: true,
        lastPulledAt: new Date(response.serverTime),
      };
      if (existing?.id) {
        await db.storeSettings.update(existing.id, {
          ...patch,
          storeName: existing.storeName || response.storeName,
        });
      } else {
        await db.storeSettings.add({
          storeName: response.storeName,
          address: '',
          phone: '',
          receiptFooter: 'Terima kasih atas kunjungan Anda!',
          printLogo: false,
          lastBackupAt: null,
          deviceId: crypto.randomUUID(),
          ...patch,
        });
      }

      await markAllFeaturesSeen();
      setState('success');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setState('error');
      if (err instanceof CloudApiError) {
        setErrorMsg(err.status === 404 || err.status === 410 ? t('expired') : err.message);
      } else {
        setErrorMsg(t('networkError'));
      }
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const existing = await db.storeSettings.toCollection().first();
      if (existing?.onboardingDone) {
        setState('confirming');
        return;
      }
      await redeem();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center px-6 text-center">
      {state === 'confirming' && (
        <AlertDialog open>
          <AlertDialogContent className="max-w-[90vw] rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('alreadySetup.title')}</AlertDialogTitle>
              <AlertDialogDescription>{t('alreadySetup.description')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => navigate('/', { replace: true })}>
                {t('alreadySetup.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={redeem}>{t('alreadySetup.confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {state === 'loading' && (
        <>
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </>
      )}

      {state === 'success' && (
        <>
          <CheckCircle2 className="w-10 h-10 text-success mb-4" />
          <p className="text-sm text-muted-foreground">{t('success')}</p>
        </>
      )}

      {state === 'error' && (
        <>
          <XCircle className="w-10 h-10 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
          <Button onClick={redeem} className="gap-1.5">
            <Store className="w-4 h-4" />
            {t('retryButton')}
          </Button>
        </>
      )}
    </div>
  );
}
