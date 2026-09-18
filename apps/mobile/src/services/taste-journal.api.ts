import type {
  TasteBoundaryGroup,
  TasteJournal,
  TasteJournalEvidenceDetail,
  TasteJournalInsight,
  TasteJournalOverrideResponse,
  TasteJournalSummary,
} from '@meal-rescue/shared-types';

import { api } from './api';

export async function getJournal(): Promise<TasteJournal> {
  const res = await api.get<TasteJournal>('/api/v1/user/taste-journal');
  return res.data;
}

export async function getJournalSummary(): Promise<TasteJournalSummary> {
  const res = await api.get<TasteJournalSummary>('/api/v1/user/taste-journal/summary');
  return res.data;
}

export async function getJournalPatterns(): Promise<TasteJournalInsight[]> {
  const res = await api.get<TasteJournalInsight[]>('/api/v1/user/taste-journal/patterns');
  return res.data;
}

export async function getJournalDependentPatterns(): Promise<TasteJournalInsight[]> {
  const res = await api.get<TasteJournalInsight[]>('/api/v1/user/taste-journal/dependent-patterns');
  return res.data;
}

export async function getJournalDiscoveries(): Promise<TasteJournalInsight[]> {
  const res = await api.get<TasteJournalInsight[]>('/api/v1/user/taste-journal/discoveries');
  return res.data;
}

export async function getJournalStillLearning(): Promise<TasteJournalInsight[]> {
  const res = await api.get<TasteJournalInsight[]>('/api/v1/user/taste-journal/still-learning');
  return res.data;
}

export async function getJournalBoundaries(): Promise<TasteBoundaryGroup[]> {
  const res = await api.get<TasteBoundaryGroup[]>('/api/v1/user/taste-journal/boundaries');
  return res.data;
}

export async function getJournalEvidence(
  insightId: string,
): Promise<TasteJournalEvidenceDetail> {
  const res = await api.get<TasteJournalEvidenceDetail>(
    `/api/v1/user/taste-journal/insights/${encodeURIComponent(insightId)}/evidence`,
  );
  return res.data;
}

export async function dismissInsight(
  insightId: string,
  note?: string,
): Promise<TasteJournalOverrideResponse> {
  const res = await api.post<TasteJournalOverrideResponse>(
    `/api/v1/user/taste-journal/insights/${encodeURIComponent(insightId)}/dismiss`,
    { note },
  );
  return res.data;
}

export async function correctInsight(
  insightId: string,
  correctedPolarity: 'positive' | 'negative',
  correctedValue?: string,
  note?: string,
): Promise<TasteJournalOverrideResponse> {
  const res = await api.post<TasteJournalOverrideResponse>(
    `/api/v1/user/taste-journal/insights/${encodeURIComponent(insightId)}/correct`,
    { correctedPolarity, correctedValue, note },
  );
  return res.data;
}

export async function forgetInsight(
  insightId: string,
  note?: string,
): Promise<TasteJournalOverrideResponse> {
  const res = await api.post<TasteJournalOverrideResponse>(
    `/api/v1/user/taste-journal/insights/${encodeURIComponent(insightId)}/forget`,
    { note },
  );
  return res.data;
}