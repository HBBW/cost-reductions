export interface User {
  id: number;
  username: string;
  name: string;
  role: 'USER' | 'FA' | 'MR';
  departmentId?: string | null;
  departmentName?: string | null;
}

export interface Department {
  id: string;
  name: string;
}

export interface MetaInfo {
  currentYear: number;
  years: number[];
  today: string;
  deadline: { monthlyInfo: string; exampleLabel: string; targetLabel: string };
}

export interface IdeaListItem {
  id: number;
  year: number;
  departmentId: string;
  departmentName: string;
  name: string;
  budget: number;
  potentialCr: number;
  actual: number;
  remark: string | null;
  monthsFilled: number;
}

export interface MonthlyRow {
  month: number;
  potentialCr: number;
  budget: number;
  actualCost: number;
  actualCr: number;
  filled: boolean;
  updatedAt: string | null;
}

export interface LockMonth {
  month: number;
  open: boolean;
}

export interface IdeaMonthlyResponse {
  idea: {
    id: number;
    year: number;
    department_id: string;
    name: string;
    budget: number;
    potentialCr: number;
    remark: string | null;
    department_name: string;
  };
  months: MonthlyRow[];
  totals: { potentialCr: number; budget: number; actualCost: number; actualCr: number };
  lockedMonths: LockMonth[];
}

export interface TargetDeptEntry {
  departmentId: string;
  departmentName: string;
  months: Record<string, number>;
}

export interface TargetsResponse {
  year: number;
  open: boolean;
  lockDate: string;
  departments: TargetDeptEntry[];
}

export interface DeptSummary {
  departmentId: string;
  departmentName: string;
  ideasCount: number;
  budget: number;
  potential: number;
  actualCost: number;
  actual: number;
  remaining: number;
  achievementPct: number | null;
  target: number;
}

export interface SummaryResponse {
  year: number;
  totals: {
    budget: number;
    potential: number;
    actualCost: number;
    actual: number;
    remaining: number;
    target: number;
    ideasCount: number;
    achievementPct: number | null;
  };
  departments: DeptSummary[];
}

export interface TrendMonth {
  month: number;
  target: number;
  actual: number;
  cumulative: number;
  future: boolean;
}

export interface TrendResponse {
  year: number;
  months: TrendMonth[];
}

export type CellStatus = 'OK' | 'MISSING' | 'CURRENT' | 'UPCOMING' | 'NO_IDEA';

export interface CompletenessCell {
  month: number;
  status: CellStatus;
  filled: number;
  total: number;
  missingIdeas: string[];
}

export interface CompletenessDept {
  departmentId: string;
  departmentName: string;
  ideasCount: number;
  targetEntered: boolean;
  months: CompletenessCell[];
}

export interface CompletenessResponse {
  year: number;
  currentMonth: number | null;
  departments: CompletenessDept[];
}

export interface DetailIdea {
  departmentName: string;
  name: string;
  remark: string | null;
  months: { month: number; potential: number; budget: number; actualCost: number; actualCr: number }[];
  /** Potential per bulan (target bulanan). */
  potentialCr: number;
  /** Potential YTD = potential per bulan × jumlah bulan terisi */
  potential: number;
  actual: number;
}
