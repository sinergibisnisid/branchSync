// Bentuk data workspace setelah dinormalisasi dari GET /bootstrap (lihat API.md dan lib/data.ts).

export type Status = 'Online' | 'Offline' | 'Belum Sync' | 'Tidak Aktif';
export type LocType = 'Kantor Cabang' | 'KCP' | 'Unit' | 'ATM';
export type GbpStatus = 'Terverifikasi' | 'Menunggu Verifikasi' | 'Belum Diklaim' | 'Suspend' | 'Duplikat';
export type Field = 'name' | 'phone' | 'hours' | 'address' | 'coords';

export interface DayHours { open: boolean; h24: boolean; ranges: { from: string; to: string }[] }
export type HoursSpec = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>;

export interface GoogleListing { name: string; phone: string; hours: string; address: string; lat: number; lng: number }

export interface Location {
  code: string; name: string; type: LocType; city: string; province: string; region: string;
  address: string; phone: string; hours: string; hoursSpec?: HoursSpec | null;
  lat: number; lng: number; status: Status; gbp: GbpStatus;
  updatedAt: number; updatedBy: string; lastSync: number | null;
  google: GoogleListing | null; accountId?: string;
}

export interface Approval {
  id: string; code: string; field: Exclude<Field, 'coords'>; before: string; after: string; by: string;
  time: number; status: 'Menunggu' | 'Disetujui' | 'Ditolak'; decidedAt: number | null; decidedBy?: string;
}

export interface Proposal {
  name: string; type: LocType; city: string; province: string; address: string; phone: string; hours: string;
  hoursSpec?: HoursSpec; lat: number; lng: number;
}

export interface Claim {
  id: string; kind: string; code?: string | null; proposal?: Proposal | null;
  submittedAt: number; processedAt: number | null; doneAt: number | null; status: string; note?: string;
}

export interface RunItem { code: string; status: 'Berhasil' | 'Gagal' | 'Dilewati'; reason: string; resolved?: boolean; note?: string }
export interface Run {
  id: string; time: number; scope: string; by: string; total: number; ok: number; fail: number; skip: number; durationMs: number; items: RunItem[];
}

export interface Change { field: string; before: string | number; after: string | number }
export interface AuditEntry {
  id: number; time: number; user: string; actor: 'Internal' | 'Eksternal'; module: string; action: string; target: string; detail: string; changes: Change[];
}

export interface User { id: number; name: string; email: string; role: string; status: 'Aktif' | 'Nonaktif'; lastActive: number | null; avatar?: string | null }
export interface Role { name: string; permissions: string[] }

export interface ApiConfig {
  connected: boolean; account: string; project: string; quotaLimit: number; quotaUsed: number; lastTest: number | null; webhook: boolean;
  clientId: string; hasClientSecret: boolean; hasApiKey: boolean; scopes: string[]; syncInterval: string; pubsubTopic: string;
}

export interface Account { id: string; name: string; email?: string; accountId?: string }

export interface Review {
  id: string; code: string; author: string; rating: number; text: string; time: number;
  reply: { text: string; by: string; time: number } | null;
}

export interface ReportSchedule {
  id: string; name: string; frequency: 'weekly' | 'monthly'; day: string; period: string; format: string; recipients: string[];
  filters?: Record<string, string>; createdAt: number | null;
}

export interface Settings { workspace: string; timezone: string; slaInternal: number; slaGoogle: number; dupRadius: number; coordTol: number }

export interface DiscNote { text: string; by: string; time: number }

export interface Workspace {
  locations: Location[]; approvals: Approval[]; claims: Claim[]; runs: Run[]; audit: AuditEntry[];
  users: User[]; roles: Role[]; api: ApiConfig; accounts: Account[]; reviews: Review[]; reportSchedules: ReportSchedule[];
  settings: Settings; discNotes: Record<string, DiscNote>; dupIgnored: string[];
}

export interface Me { name: string; email: string; role: string; permissions: string[] | null; avatar?: string }
