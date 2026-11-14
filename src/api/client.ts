import type {
  Catalog,
  CheckinPayload,
  CheckinResult,
  CrewMember,
  HistoryResponse,
  ProgressSummary,
  ReportResponse,
  ScenarioDescriptor,
  Summary,
} from '../shared/types.ts';

export class ApiRequestError extends Error {
  code: string;
  field?: string;
  status: number;

  constructor(code: string, message: string, status: number, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errObj = data?.error;
    throw new ApiRequestError(
      errObj?.code ?? 'server_error',
      errObj?.message ?? `Request failed (${res.status})`,
      res.status,
      errObj?.field
    );
  }
  return data as T;
}

export const vigilApi = {
  getCatalog: () => requestJson<Catalog>('/api/catalog'),
  listCrew: () => requestJson<CrewMember[]>('/api/crew'),
  updateCrew: (
    crewId: string,
    patch: Partial<Pick<CrewMember, 'environment' | 'name' | 'role' | 'baseline_mass_kg'>>
  ) =>
    requestJson<CrewMember>(`/api/crew/${encodeURIComponent(crewId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getSummary: (crewId: string) =>
    requestJson<Summary>(`/api/crew/${encodeURIComponent(crewId)}/summary`),
  submitCheckin: (crewId: string, payload: CheckinPayload) =>
    requestJson<CheckinResult>(`/api/crew/${encodeURIComponent(crewId)}/checkins`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getHistory: (crewId: string, days = 30) =>
    requestJson<HistoryResponse>(
      `/api/crew/${encodeURIComponent(crewId)}/history?days=${days}`
    ),
  getProgress: (crewId: string) =>
    requestJson<ProgressSummary>(`/api/crew/${encodeURIComponent(crewId)}/progress`),
  getReport: (crewId: string) =>
    requestJson<ReportResponse>(`/api/crew/${encodeURIComponent(crewId)}/report`),
  listScenarios: () => requestJson<ScenarioDescriptor[]>('/api/dev/scenarios'),
  applyScenario: (crewId: string, scenarioId: string) =>
    requestJson<Summary>('/api/dev/scenario', {
      method: 'POST',
      body: JSON.stringify({ crew_id: crewId, scenario_id: scenarioId }),
    }),
  resetAll: () =>
    requestJson<{ ok: boolean }>('/api/dev/reset', {
      method: 'POST',
    }),
};
