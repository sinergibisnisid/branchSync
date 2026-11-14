// Command branchsync menjalankan server API BranchSync (Mode Live).
//
//	branchsync serve                       jalankan server (default; migrasi otomatis)
//	branchsync migrate                     jalankan migrasi skema saja
//	branchsync create-admin -email E -name N [-username U]
//	                                       buat/aktifkan administrator; kata sandi dibaca dari BS_ADMIN_PASSWORD atau stdin
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"branchsync/server/internal/app"
	"branchsync/server/internal/config"
	"branchsync/server/internal/db"
	"branchsync/server/internal/mail"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cmd := "serve"
	args := os.Args[1:]
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve(log)
	case "migrate":
		err = migrate(log)
	case "create-admin":
		err = createAdmin(log, args)
	case "version":
		fmt.Println(config.Version)
	default:
		err = fmt.Errorf("perintah tidak dikenal: %s (serve | migrate | create-admin | version)", cmd)
	}
	if err != nil {
		log.Error("gagal", "err", err)
		os.Exit(1)
	}
}

func open(ctx context.Context, log *slog.Logger) (*config.Config, *app.Server, func(), error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, nil, err
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, nil, err
	}
	applied, err := db.Migrate(ctx, pool)
	if err != nil {
		pool.Close()
		return nil, nil, nil, err
	}
	if len(applied) > 0 {
		log.Info("migrasi dijalankan", "files", applied)
	}
	var sender mail.Sender = mail.LogSender{Log: log}
	if cfg.SMTPHost != "" {
		sender = mail.SMTP{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, From: cfg.SMTPFrom}
	} else if !cfg.Dev {
		log.Warn("BS_SMTP_HOST belum diatur: kode OTP dan laporan terjadwal tidak terkirim (hanya dicatat di log)")
	}
	srv, err := app.New(cfg, pool, sender, log)
	if err != nil {
		pool.Close()
		return nil, nil, nil, err
	}
	return cfg, srv, func() { srv.Close(); pool.Close() }, nil
}

func serve(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, srv, closeAll, err := open(ctx, log)
	if err != nil {
		return err
	}
	defer closeAll()
	if len(cfg.Origins) == 0 {
		log.Warn("BS_ALLOWED_ORIGINS kosong: browser akan menolak permintaan dari frontend (CORS)")
	}
	if cfg.SchedulerEnabled {
		srv.Scheduler()
	}
	hs := &http.Server{Addr: cfg.Addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}
	errc := make(chan error, 1)
	go func() { errc <- hs.ListenAndServe() }()
	log.Info("BranchSync API berjalan", "addr", cfg.Addr, "public_url", cfg.PublicURL, "version", config.Version)
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("menghentikan server…")
		sctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = hs.Shutdown(sctx)
	}
	return nil
}

func migrate(log *slog.Logger) error {
	ctx := context.Background()
	_, _, closeAll, err := open(ctx, log)
	if err == nil {
		closeAll()
		log.Info("skema database sudah terbaru")
	}
	return err
}

func createAdmin(log *slog.Logger, args []string) error {
	fs := flag.NewFlagSet("create-admin", flag.ContinueOnError)
	email := fs.String("email", "", "email administrator (wajib)")
	name := fs.String("name", "Administrator", "nama tampilan")
	username := fs.String("username", "", "nama pengguna untuk login (opsional; email juga bisa dipakai)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *email == "" {
		return errors.New("-email wajib diisi")
	}
	password := os.Getenv("BS_ADMIN_PASSWORD")
	if password == "" {
		fmt.Fprint(os.Stderr, "Kata sandi administrator (min. 10 karakter): ")
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && line == "" {
			return err
		}
		password = strings.TrimRight(line, "\r\n")
	}
	if len([]rune(password)) < 10 {
		return errors.New("kata sandi minimal 10 karakter")
	}
	ctx := context.Background()
	cfg, _, closeAll, err := open(ctx, log)
	if err != nil {
		return err
	}
	defer closeAll()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	hash, err := app.HashPassword(password)
	if err != nil {
		return err
	}
	var user *string
	if *username != "" {
		user = username
	}
	_, err = pool.Exec(ctx, `INSERT INTO users (name, email, username, role, status, password_hash) VALUES ($1, lower($2), $3, 'Administrator', 'Aktif', $4)
		ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, username = coalesce(EXCLUDED.username, users.username), role = 'Administrator', status = 'Aktif', password_hash = EXCLUDED.password_hash`,
		*name, *email, user, hash)
	if err == nil {
		log.Info("administrator siap", "email", strings.ToLower(*email))
	}
	return err
}
