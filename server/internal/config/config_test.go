package config

import (
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	proxies, err := parsePrefixes("172.16.0.0/12, 10.0.0.5")
	if err != nil {
		t.Fatal(err)
	}
	c := &Config{TrustedProxies: proxies}
	cases := []struct {
		name, remote string
		xff          []string
		want         string
	}{
		{"langsung tanpa proxy", "203.0.113.7:5000", nil, "203.0.113.7"},
		{"klien memalsukan XFF tanpa proxy", "203.0.113.7:5000", []string{"1.2.3.4"}, "203.0.113.7"},
		{"lewat proxy", "172.18.0.3:4000", []string{"198.51.100.9"}, "198.51.100.9"},
		{"klien memalsukan XFF lewat proxy", "172.18.0.3:4000", []string{"1.2.3.4, 198.51.100.9"}, "198.51.100.9"},
		{"dua proxy tepercaya", "10.0.0.5:4000", []string{"198.51.100.9, 172.18.0.3"}, "198.51.100.9"},
		{"header ganda", "172.18.0.3:4000", []string{"1.2.3.4", "198.51.100.9"}, "198.51.100.9"},
		{"proxy tanpa XFF", "172.18.0.3:4000", nil, "172.18.0.3"},
		{"XFF rusak", "172.18.0.3:4000", []string{"bukan-ip"}, "172.18.0.3"},
		{"IPv6 klien", "172.18.0.3:4000", []string{"2001:db8::1"}, "2001:db8::1"},
	}
	for _, tc := range cases {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = tc.remote
		for _, v := range tc.xff {
			r.Header.Add("X-Forwarded-For", v)
		}
		if got := c.ClientIP(r); got != tc.want {
			t.Errorf("%s: dapat %q, ingin %q", tc.name, got, tc.want)
		}
	}
	// Tanpa BS_TRUSTED_PROXIES, header tidak pernah dipercaya.
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:4000"
	r.Header.Set("X-Forwarded-For", "198.51.100.9")
	if got := (&Config{}).ClientIP(r); got != "172.18.0.3" {
		t.Errorf("tanpa proxy tepercaya: dapat %q", got)
	}
}

func TestParsePrefixesInvalid(t *testing.T) {
	if _, err := parsePrefixes("10.0.0.0/8,bukan-cidr"); err == nil {
		t.Fatal("ingin galat untuk CIDR tidak valid")
	}
}
