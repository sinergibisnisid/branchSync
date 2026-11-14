'use strict';
/*
 * Konfigurasi deploy BranchSync (frontend).
 * apiBaseUrl: URL server API BranchSync — sama dengan BS_PUBLIC_URL di server, mis.
 *   'https://api.branchsync.co.id/v1'. Dialog Masuk tidak menampilkan kolom URL server, jadi nilai ini wajib diisi.
 * Nilai di bawah untuk pengembangan lokal (server Go default: BS_PUBLIC_URL=http://localhost:8080).
 * Saat deploy dengan deploy/docker-compose.yml, file ini dibuat otomatis dari .env oleh Caddy.
 */
window.BRANCHSYNC_CONFIG = {
  apiBaseUrl: 'http://localhost:8080/v1'
};
