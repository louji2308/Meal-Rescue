import { api } from './api';

export interface KitchenItem {
  id: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  addedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usePriority: number;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  isLowStock: boolean;
  state: 'fresh' | 'opened' | 'leftover' | 'use_soon' | 'gone';
  stateReason: string;
  daysActive: number;
  usesSinceAdded: number;
}

export interface KitchenSignal {
  id: string;
  type: 'use_first' | 'almost_a_meal' | 'expiring_soon' | 'low_stock' | 'unused_long';
  title: string;
  description: string;
  items: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionPayload?: string;
}

export interface KitchenOpportunity {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  effort: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  whyGood: string;
}

export interface KitchenDashboard {
  items: KitchenItem[];
  signals: KitchenSignal[];
  opportunities: KitchenOpportunity[];
  stats: {
    totalItems: number;
    expiringCount: number;
    useSoonCount: number;
    freshCount: number;
    leftoverCount: number;
  };
}

export interface IdentifyFood {
  name: string;
  confidence: number;
  estimatedExpiryDays?: number;
  category: string;
  state: 'raw' | 'cooked' | 'leftover' | 'packaged';
}

export interface IdentifyResponse {
  foods: IdentifyFood[];
  summary: string;
}

export interface WhatCanIMakeIdea {
  name: string;
  ingredients: string[];
  missingEssentials: string[];
  effort: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  description: string;
}

export interface WhatCanIMakeResponse {
  ideas: WhatCanIMakeIdea[];
}

/**
 * Kitchen API client — calls /api/v1/kitchen/*
 */
export async function getKitchenDashboard(): Promise<KitchenDashboard> {
  const res = await api.get<KitchenDashboard>('/api/v1/kitchen');
  return res.data;
}

export async function identifyKitchenFood(
  imageBase64: string,
  mimeType: string,
): Promise<IdentifyResponse> {
  const res = await api.post<IdentifyResponse>('/api/v1/kitchen/identify', {
    imageBase64,
    mimeType,
  });
  return res.data;
}

export async function whatCanIMake(params?: {
  cuisine?: string;
  timeAvailable?: number;
}): Promise<WhatCanIMakeResponse> {
  const res = await api.post<WhatCanIMakeResponse>(
    '/api/v1/kitchen/what-can-i-make',
    params ?? {},
  );
  return res.data;
}

export async function upsertKitchenItem(payload: {
  ingredientName: string;
  quantity?: number;
  unit?: string;
  expiresAt?: string;
  usePriority?: number;
}): Promise<KitchenItem> {
  const res = await api.post<KitchenItem>('/api/v1/pantry', payload);
  return res.data as any;
}

export async function deleteKitchenItem(itemId: string): Promise<void> {
  await api.delete(`/api/v1/pantry/${itemId}`);
}

export async function markKitchenItemUsed(itemId: string): Promise<void> {
  await api.post(`/api/v1/pantry/${itemId}/use`);
}
