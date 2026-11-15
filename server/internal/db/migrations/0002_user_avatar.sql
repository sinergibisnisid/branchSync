-- Foto profil pengguna (JPEG/PNG kecil, sudah diperkecil di browser).
-- avatar_key: kunci acak untuk URL publik /avatars/{key}; berganti setiap kali foto diganti.
ALTER TABLE users
  ADD COLUMN avatar      bytea,
  ADD COLUMN avatar_type text,
  ADD COLUMN avatar_key  text;
CREATE UNIQUE INDEX users_avatar_key ON users (avatar_key) WHERE avatar_key IS NOT NULL;
