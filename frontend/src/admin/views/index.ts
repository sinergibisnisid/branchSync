// Peta halaman admin (id → komponen).
import type { ComponentType } from 'react';
import type { ViewId } from '../../lib/domain';
import { Dashboard } from './Dashboard';
import { Approvals, Claims, Discrepancies, Duplicates } from './DataViews';
import { Guide, Scenarios } from './Guide';
import { Locations } from './Locations';
import { MapView } from './MapView';
import { Access, Audit, Integrations, SettingsView, Sla, SyncView } from './OpsViews';
import { Profile } from './Profile';
import { Reports } from './Reports';
import { Reviews } from './Reviews';

export const VIEWS: Record<ViewId, ComponentType> = {
  dashboard: Dashboard, map: MapView, reports: Reports, sla: Sla,
  locations: Locations, discrepancies: Discrepancies, duplicates: Duplicates, claims: Claims,
  approvals: Approvals, reviews: Reviews, sync: SyncView, audit: Audit,
  access: Access, integrations: Integrations, settings: SettingsView, profile: Profile,
  guide: Guide, scenarios: Scenarios
};
