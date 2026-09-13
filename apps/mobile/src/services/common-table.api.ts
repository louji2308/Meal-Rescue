import type {
  CommonTableCompleteRequest,
  CommonTableCompleteResponse,
  CommonTableFeedbackRequest,
  CommonTableFeedbackResponse,
  CommonTableRequest,
  CommonTableResult,
  CreateHouseholdResponse,
  CreateMemberRequest,
  CreateMemberResponse,
  DeleteMemberResponse,
  GetHouseholdResponse,
  Household,
  HouseholdMemberProfile,
  UpdateMemberRequest,
  UpdateMemberResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

/**
 * Common Table API client — households + the one-meal-for-many convergence
 * loop at /api/v1/households/* and /api/v1/common-table/*.
 */

export async function getHousehold(): Promise<Household | null> {
  const res = await api.get<GetHouseholdResponse>('/api/v1/households/current');
  return res.data.household;
}

export async function createHousehold(name?: string): Promise<Household> {
  const res = await api.post<CreateHouseholdResponse>('/api/v1/households', { name });
  return res.data.household;
}

export async function addHouseholdMember(
  payload: CreateMemberRequest,
): Promise<HouseholdMemberProfile> {
  const res = await api.post<CreateMemberResponse>('/api/v1/households/members', payload);
  return res.data.member;
}

export async function updateHouseholdMember(
  memberId: string,
  payload: UpdateMemberRequest,
): Promise<HouseholdMemberProfile> {
  const res = await api.patch<UpdateMemberResponse>(
    `/api/v1/households/members/${memberId}`,
    payload,
  );
  return res.data.member;
}

export async function removeHouseholdMember(memberId: string): Promise<boolean> {
  const res = await api.delete<DeleteMemberResponse>(`/api/v1/households/members/${memberId}`);
  return res.data.removed;
}

export async function convergeMeal(request: CommonTableRequest): Promise<CommonTableResult> {
  const res = await api.post<CommonTableResult>('/api/v1/common-table/converge', request);
  return res.data;
}

export async function getSharedMeal(sharedMealId: string): Promise<CommonTableResult> {
  const res = await api.get<CommonTableResult>(`/api/v1/common-table/${sharedMealId}`);
  return res.data;
}

export async function startCooking(sharedMealId: string): Promise<CommonTableResult> {
  const res = await api.post<CommonTableResult>(`/api/v1/common-table/${sharedMealId}/start`);
  return res.data;
}

export async function splitReached(sharedMealId: string): Promise<CommonTableResult> {
  const res = await api.post<CommonTableResult>(`/api/v1/common-table/${sharedMealId}/split`);
  return res.data;
}

export async function completeMeal(
  sharedMealId: string,
  payload: CommonTableCompleteRequest,
): Promise<CommonTableCompleteResponse> {
  const res = await api.post<CommonTableCompleteResponse>(
    `/api/v1/common-table/${sharedMealId}/complete`,
    payload,
  );
  return res.data;
}

export async function submitMealFeedback(
  sharedMealId: string,
  payload: CommonTableFeedbackRequest,
): Promise<CommonTableFeedbackResponse> {
  const res = await api.post<CommonTableFeedbackResponse>(
    `/api/v1/common-table/${sharedMealId}/feedback`,
    payload,
  );
  return res.data;
}