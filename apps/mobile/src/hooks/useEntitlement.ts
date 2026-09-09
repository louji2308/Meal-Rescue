import { useCallback, useEffect, useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  ENTITLEMENT_ID,
  fetchIsPro,
  isRevenueCatConfigured,
  onCustomerInfoChanged,
  purchasePackage,
  restorePurchases,
} from '../services/revenuecat.service';

/**
 * Live Pro entitlement for UI gating. Backed by RevenueCat when configured;
 * always false in dev builds without keys. The backend remains the source
 * of truth for rescue limits - this hook only drives surfaces (paywall,
 * hiding ad slots).
 */
export function useEntitlement() {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(isRevenueCatConfigured());
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  const refresh = useCallback(async () => {
    if (!isRevenueCatConfigured()) {
      setIsPro(false);
      return;
    }
    setLoading(true);
    try {
      setIsPro(await fetchIsPro());
      setPackages(
        await import('../services/revenuecat.service').then((m) => m.fetchCurrentPackages()),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onCustomerInfoChanged((info) => {
      setIsPro(info.entitlements.active[ENTITLEMENT_ID] !== undefined);
    });
  }, [refresh]);

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => purchasePackage(pkg),
    [],
  );

  const restore = useCallback(async (): Promise<boolean> => restorePurchases(), []);

  return { isPro, loading, packages, refresh, purchase, restore };
}
