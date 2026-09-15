import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { ErrorBanner } from './ErrorBanner';
import { PrimaryButton } from './PrimaryButton';

type RemoteViewProps = {
  loading: boolean;
  error: ReturnType<typeof import('../services/api').toApiError> | null;
  skeleton: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  children: ReactNode;
};

export function RemoteView({
  loading,
  error,
  skeleton,
  onRetry,
  retryLabel = 'Try again',
  children,
}: RemoteViewProps) {
  if (loading && !error) {
    return <View>{skeleton}</View>;
  }
  if (error && !onRetry) {
    return (
      <View>
        <ErrorBanner error={error} />
        {children}
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <ErrorBanner error={error} />
        {onRetry && (
          <PrimaryButton
            label={retryLabel}
            variant="secondary"
            onPress={onRetry}
            style={styles.retry}
          />
        )}
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  retry: {
    alignSelf: 'stretch',
  },
});

/**
 * Keeps last-loaded data on screen across refetches (tab returns, pull-to-refresh,
 * retries) so users never see an empty flash. Pass `hasData` when the caller
 * decides "we have something to show" (e.g. `dashboard !== null`).
 */
export function useStaleOnFocus<T>({
  fetcher,
  deps = [],
  hasData = true,
  staleMs = 60_000,
}: {
  fetcher: () => Promise<T>;
  deps?: React.DependencyList;
  hasData?: boolean;
  staleMs?: number;
}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ReturnType<typeof import('../services/api').toApiError> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoadedAt = useRef(0);
  const sawData = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'background') => {
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'initial') setLoading(true);
      try {
        const next = await fetcher();
        setData(next);
        setError(null);
        lastLoadedAt.current = Date.now();
        sawData.current = true;
      } catch (err) {
        // Keep stale data visible; only surface an error when we have nothing.
        const apiError = err as ReturnType<typeof import('../services/api').toApiError>;
        if (!sawData.current) setError(apiError);
        else if (mode === 'refresh') setError(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetcher, ...deps],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onRefresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  /** Background refetch only when stale — used on tab focus. */
  const refetchIfStale = useCallback(() => {
    if (!hasData) return;
    if (Date.now() - lastLoadedAt.current > staleMs) {
      void load('background');
    }
  }, [hasData, load, staleMs]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
  );

  return {
    data,
    error,
    loading,
    refreshing,
    onRefresh,
    refetchIfStale,
    refreshControl,
    setData,
    setError,
  };
}