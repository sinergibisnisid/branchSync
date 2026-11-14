// Package mail mengirim email (kode OTP, laporan terjadwal) lewat SMTP.
// Tanpa BS_SMTP_HOST, email hanya dicatat ke log (untuk pengembangan).
package mail

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

type Attachment struct {
	Name, ContentType string
	Data              []byte
}

type Sender interface {
	Send(ctx context.Context, to []string, subject, body string, files ...Attachment) error
}

type SMTP struct {
	Host, User, Pass, From string
	Port                   int
}

type LogSender struct{ Log *slog.Logger }

func (l LogSender) Send(_ context.Context, to []string, subject, body string, files ...Attachment) error {
	names := make([]string, len(files))
	for i, f := range files {
		names[i] = fmt.Sprintf("%s (%d byte)", f.Name, len(f.Data))
	}
	l.Log.Info("email (SMTP belum diatur — hanya dicatat)", "to", to, "subject", subject, "body", body, "attachments", names)
	return nil
}

func (s SMTP) Send(ctx context.Context, to []string, subject, body string, files ...Attachment) error {
	msg := build(s.From, to, subject, body, files)
	addr := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	var auth smtp.Auth
	if s.User != "" {
		auth = smtp.PlainAuth("", s.User, s.Pass, s.Host)
	}
	from := s.From
	if a, err := mailAddress(s.From); err == nil {
		from = a
	}
	done := make(chan error, 1)
	go func() {
		if s.Port == 465 { // TLS langsung
			conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12})
			if err != nil {
				done <- err
				return
			}
			c, err := smtp.NewClient(conn, s.Host)
			if err != nil {
				done <- err
				return
			}
			defer c.Close()
			if auth != nil {
				if err := c.Auth(auth); err != nil {
					done <- err
					return
				}
			}
			if err := c.Mail(from); err != nil {
				done <- err
				return
			}
			for _, t := range to {
				if err := c.Rcpt(t); err != nil {
					done <- err
					return
				}
			}
			w, err := c.Data()
			if err != nil {
				done <- err
				return
			}
			if _, err := w.Write(msg); err != nil {
				done <- err
				return
			}
			if err := w.Close(); err != nil {
				done <- err
				return
			}
			done <- c.Quit()
			return
		}
		done <- smtp.SendMail(addr, auth, from, to, msg) // STARTTLS otomatis bila didukung server
	}()
	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("gagal mengirim email: %w", err)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(30 * time.Second):
		return fmt.Errorf("gagal mengirim email: server SMTP tidak merespons")
	}
}

func mailAddress(s string) (string, error) {
	if i, j := strings.LastIndex(s, "<"), strings.LastIndex(s, ">"); i >= 0 && j > i {
		return s[i+1 : j], nil
	}
	if strings.Contains(s, "@") {
		return strings.TrimSpace(s), nil
	}
	return "", fmt.Errorf("alamat tidak valid")
}

func build(from string, to []string, subject, body string, files []Attachment) []byte {
	var b bytes.Buffer
	boundary := fmt.Sprintf("bs-%d", time.Now().UnixNano())
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\n", from, strings.Join(to, ", "), mime.QEncoding.Encode("utf-8", subject), time.Now().Format(time.RFC1123Z))
	if len(files) == 0 {
		fmt.Fprintf(&b, "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", wrap(base64.StdEncoding.EncodeToString([]byte(body))))
		return b.Bytes()
	}
	fmt.Fprintf(&b, "Content-Type: multipart/mixed; boundary=%q\r\n\r\n--%s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", boundary, boundary, wrap(base64.StdEncoding.EncodeToString([]byte(body))))
	for _, f := range files {
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\nContent-Disposition: attachment; filename=%q\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", boundary, f.ContentType, f.Name, wrap(base64.StdEncoding.EncodeToString(f.Data)))
	}
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return b.Bytes()
}

func wrap(s string) string {
	var b strings.Builder
	for len(s) > 76 {
		b.WriteString(s[:76] + "\r\n")
		s = s[76:]
	}
	b.WriteString(s)
	return b.String()
}
