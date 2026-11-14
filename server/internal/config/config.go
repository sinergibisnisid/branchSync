// Package config membaca konfigurasi server dari variabel lingkungan (lihat .env.example).
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version dikirim lewat GET /health.
const Version = "1.0.0"

type Config struct {
	Addr        string        // alamat listen, mis. ":8080"
	DatabaseURL string        // postgres://user:pass@host:5432/db?sslmode=disable
	PublicURL   string        // URL publik server termasuk prefiks path, mis. https://api.branchsync.co.id/v1
	BasePath    string        // prefiks path dari PublicURL ("/v1"), dibuang sebelum routing
	Origins     []string      // origin frontend yang diizinkan CORS; "*" = semua (hanya untuk pengembangan)
	SecretKey   []byte        // 32 byte — mengenkripsi client secret, API key, dan refresh token Google
	SessionTTL  time.Duration // masa berlaku sesi
	Dev         bool          // mode pengembangan: kode OTP & email dicetak ke log

	SMTPHost, SMTPUser, SMTPPass, SMTPFrom string
	SMTPPort                               int

	GoogleClientID, GoogleClientSecret string // opsional; bila kosong memakai konfigurasi dari PATCH /integrations/google
	PubSubToken                        string // token rahasia pada URL push Pub/Sub
	SchedulerEnabled                   bool   // jalankan job berkala (sync, ulasan, laporan)

	Google GoogleEndpoints
}

// GoogleEndpoints bisa diganti untuk pengujian (server Google tiruan).
type GoogleEndpoints struct {
	AuthURL, TokenURL, UserInfoURL string
	AccountsAPI                    string // mybusinessaccountmanagement
	BusinessInfoAPI                string // mybusinessbusinessinformation
	ReviewsAPI                     string // mybusiness v4 (ulasan)
	VerificationsAPI               string // mybusinessverifications
	NotificationsAPI               string // mybusinessnotifications
}

func DefaultGoogle() GoogleEndpoints {
	return GoogleEndpoints{
		AuthURL:          "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:         "https://oauth2.googleapis.com/token",
		UserInfoURL:      "https://openidconnect.googleapis.com/v1/userinfo",
		AccountsAPI:      "https://mybusinessaccountmanagement.googleapis.com/v1",
		BusinessInfoAPI:  "https://mybusinessbusinessinformation.googleapis.com/v1",
		ReviewsAPI:       "https://mybusiness.googleapis.com/v4",
		VerificationsAPI: "https://mybusinessverifications.googleapis.com/v1",
		NotificationsAPI: "https://mybusinessnotifications.googleapis.com/v1",
	}
}

func Load() (*Config, error) {
	c := &Config{
		Addr:               env("BS_ADDR", ":8080"),
		DatabaseURL:        os.Getenv("BS_DATABASE_URL"),
		PublicURL:          strings.TrimRight(env("BS_PUBLIC_URL", "http://localhost:8080"), "/"),
		SessionTTL:         envDuration("BS_SESSION_TTL", 12*time.Hour),
		Dev:                envBool("BS_DEV", false),
		SMTPHost:           os.Getenv("BS_SMTP_HOST"),
		SMTPUser:           os.Getenv("BS_SMTP_USER"),
		SMTPPass:           os.Getenv("BS_SMTP_PASS"),
		SMTPFrom:           env("BS_SMTP_FROM", "BranchSync <no-reply@localhost>"),
		SMTPPort:           envInt("BS_SMTP_PORT", 587),
		GoogleClientID:     os.Getenv("BS_GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("BS_GOOGLE_CLIENT_SECRET"),
		PubSubToken:        os.Getenv("BS_PUBSUB_TOKEN"),
		SchedulerEnabled:   envBool("BS_SCHEDULER", true),
		Google:             DefaultGoogle(),
	}
	if c.DatabaseURL == "" {
		return nil, errors.New("BS_DATABASE_URL wajib diisi")
	}
	u, err := url.Parse(c.PublicURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("BS_PUBLIC_URL tidak valid: %q", c.PublicURL)
	}
	c.BasePath = strings.TrimRight(u.Path, "/")
	for _, o := range strings.Split(env("BS_ALLOWED_ORIGINS", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.Origins = append(c.Origins, strings.TrimRight(o, "/"))
		}
	}
	key, err := base64.StdEncoding.DecodeString(os.Getenv("BS_SECRET_KEY"))
	if err != nil || len(key) != 32 {
		return nil, errors.New("BS_SECRET_KEY wajib berisi 32 byte dalam base64 (buat dengan: openssl rand -base64 32)")
	}
	c.SecretKey = key
	g := &c.Google
	for envName, p := range map[string]*string{
		"BS_GOOGLE_AUTH_URL": &g.AuthURL, "BS_GOOGLE_TOKEN_URL": &g.TokenURL, "BS_GOOGLE_USERINFO_URL": &g.UserInfoURL,
		"BS_GBP_ACCOUNTS_API": &g.AccountsAPI, "BS_GBP_BUSINESSINFO_API": &g.BusinessInfoAPI, "BS_GBP_REVIEWS_API": &g.ReviewsAPI,
		"BS_GBP_VERIFICATIONS_API": &g.VerificationsAPI, "BS_GBP_NOTIFICATIONS_API": &g.NotificationsAPI,
	} {
		if v := os.Getenv(envName); v != "" {
			*p = strings.TrimRight(v, "/")
		}
	}
	return c, nil
}

// OriginAllowed memeriksa origin CORS. Halaman dari file:// mengirim Origin "null".
func (c *Config) OriginAllowed(origin string) bool {
	for _, o := range c.Origins {
		if o == "*" || o == origin {
			return true
		}
	}
	return false
}

// RedirectAllowed mencegah open redirect: redirect_uri harus ber-origin yang diizinkan, atau file:// bila diaktifkan.
func (c *Config) RedirectAllowed(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Fragment != "" {
		return false
	}
	// file:// tidak didukung: browser memblokir redirect dari server http(s) ke halaman file lokal,
	// jadi login Google / hubungkan GBP butuh frontend yang dilayani lewat http(s).
	if u.Scheme != "http" && u.Scheme != "https" || u.Host == "" {
		return false
	}
	origin := u.Scheme + "://" + u.Host
	for _, o := range c.Origins {
		if o == origin || (o == "*" && c.Dev) {
			return true
		}
	}
	return false
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
func envBool(k string, def bool) bool {
	if v, err := strconv.ParseBool(os.Getenv(k)); err == nil {
		return v
	}
	return def
}
func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return def
}
func envDuration(k string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return def
}
