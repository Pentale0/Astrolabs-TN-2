export type Status = 'normal' | 'watch' | 'alert';
export type OverallStatus = Status | 'no_data';
export type TrendDirection = 'up' | 'down' | 'flat' | 'none';
export type Cadence = 'daily' | 'weekly';
export type EvalMode = 'single' | 'mean_7d' | 'baseline_pct';

export interface InputFieldSpec {
  key: 'value' | 'value2';
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  placeholder?: string;
}

export interface ThresholdBand {
  status: Status;
  gte?: number;
  lt?: number;
}

export interface CatalogEnvironment {
  id: string;
  name: string;
  comm_delay_label: string;
  autonomous_escalation: boolean;
  escalation_note: string;
}

export interface CatalogRegion {
  id: string;
  name: string;
  subtitle: string;
  hazard: string;
}

export interface CatalogIndicator {
  id: string;
  name: string;
  region_id: string;
  cadence: Cadence;
  eval_mode: EvalMode;
  unit: string;
  description: string;
  input: {
    fields: InputFieldSpec[];
  };
  bands: ThresholdBand[];
  bands2?: ThresholdBand[];
  messages: Record<Status, string>;
  actions: Partial<Record<Status, string[]>>;
}

export interface CatalogSymptom {
  id: string;
  name: string;
  region_id: string;
  severities: Record<string, Status>;
  description: string;
}

export interface CatalogBadge {
  id: string;
  name: string;
  description: string;
  points: number;
}

export interface CatalogLevel {
  level: number;
  name: string;
  min_points: number;
}

export interface Catalog {
  version: string;
  environments: CatalogEnvironment[];
  regions: CatalogRegion[];
  indicators: CatalogIndicator[];
  symptoms: CatalogSymptom[];
  badges: CatalogBadge[];
  levels: CatalogLevel[];
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  environment: string;
  baseline_mass_kg: number;
  mission_start_date: string;
  avatar_color: string;
}

export interface MeasurementRecord {
  id: number;
  crew_id: string;
  checkin_id: string;
  indicator_id: string;
  value: number;
  value2: number | null;
  measured_at: string;
  status: Status;
}

export interface SymptomRecord {
  id: number;
  crew_id: string;
  checkin_id: string;
  symptom_id: string;
  severity: number;
  reported_at: string;
}

export interface CheckinRecord {
  id: string;
  crew_id: string;
  created_at: string;
  note: string | null;
}

export interface BadgeAwardRecord {
  crew_id: string;
  badge_id: string;
  earned_at: string;
}

export interface IndicatorSummary {
  indicator_id: string;
  name: string;
  region_id: string;
  cadence: Cadence;
  eval_mode: EvalMode;
  unit: string;
  status: OverallStatus;
  latest_value: number | null;
  latest_value2: number | null;
  evaluated_value: number | null;
  display_value: string;
  measured_at: string | null;
  days_since: number | null;
  due: boolean;
  trend: TrendDirection;
  sparkline: number[];
  message: string;
  actions: string[];
}

export interface ActiveSymptomSummary {
  symptom_id: string;
  name: string;
  region_id: string;
  severity: number;
  status: Status;
  reported_at: string;
}

export interface Insight {
  id: string;
  severity: Status | 'info';
  title: string;
  message: string;
  region_id: string | null;
  indicator_ids: string[];
  symptom_ids: string[];
  actions: string[];
}

export interface EscalationInfo {
  required: boolean;
  level: 'none' | 'crew' | 'flight_surgeon';
  comm_delay_label: string;
  autonomous_protocol: boolean;
  note: string;
}

export interface RegionSummary {
  region_id: string;
  name: string;
  subtitle: string;
  hazard: string;
  status: OverallStatus;
  headline: string;
  indicators: IndicatorSummary[];
  active_symptoms: ActiveSymptomSummary[];
  actions: string[];
}

export interface Summary {
  crew: CrewMember;
  environment: CatalogEnvironment;
  generated_at: string;
  overall_status: OverallStatus;
  headline: string;
  subline: string;
  due_count: number;
  escalation: EscalationInfo;
  regions: RegionSummary[];
  insights: Insight[];
}

export interface BadgeProgress {
  badge_id: string;
  name: string;
  description: string;
  points: number;
  earned: boolean;
  earned_at: string | null;
}

export interface ProgressSummary {
  crew_id: string;
  points: number;
  level: number;
  level_name: string;
  points_to_next_level: number | null;
  next_level_points: number | null;
  current_streak: number;
  best_streak: number;
  total_checkins: number;
  checkin_days: number;
  badges: BadgeProgress[];
}

export interface CheckinEntryInput {
  indicator_id: string;
  value: number;
  value2?: number | null;
}

export interface CheckinSymptomInput {
  symptom_id: string;
  severity: number;
}

export interface CheckinPayload {
  entries: CheckinEntryInput[];
  symptoms?: CheckinSymptomInput[];
  symptoms_reviewed?: boolean;
  note?: string | null;
}

export interface CheckinEntryResult {
  indicator_id: string;
  name: string;
  value: number;
  value2: number | null;
  display_value: string;
  status: Status;
  message: string;
  actions: string[];
}

export interface CheckinResult {
  checkin_id: string;
  crew_id: string;
  created_at: string;
  entries: CheckinEntryResult[];
  insights: Insight[];
  points_earned: number;
  new_badges: BadgeProgress[];
  progress: ProgressSummary;
}

export interface HistoryPoint {
  id: number;
  checkin_id: string;
  value: number;
  value2: number | null;
  display_value: string;
  measured_at: string;
  status: Status;
}

export interface IndicatorHistory {
  indicator_id: string;
  name: string;
  unit: string;
  region_id: string;
  eval_mode: EvalMode;
  bands: ThresholdBand[];
  bands2?: ThresholdBand[];
  points: HistoryPoint[];
}

export interface HistoryResponse {
  crew_id: string;
  days: number;
  indicators: IndicatorHistory[];
  recent_checkins: Array<{
    id: string;
    created_at: string;
    note: string | null;
    entry_count: number;
    symptom_count: number;
  }>;
}

export interface ReportResponse {
  crew_id: string;
  generated_at: string;
  text: string;
}

export interface ScenarioDescriptor {
  id: string;
  name: string;
  description: string;
  expected_status: OverallStatus;
}
