// Pengumuman pembaca layar (progres sync, jumlah hasil filter, aksi massal) lewat region aria-live #bsAnnounce.
let timer = 0;
export function announce(msg: string) {
  const el = document.getElementById('bsAnnounce');
  if (!el) return;
  clearTimeout(timer);
  el.textContent = '';
  timer = window.setTimeout(() => { el.textContent = msg; }, 60); // dikosongkan dulu agar pesan sama tetap dibacakan
}
