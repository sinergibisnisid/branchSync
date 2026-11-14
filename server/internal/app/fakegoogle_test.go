package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"

	"branchsync/server/internal/config"
)

// fakeGoogle meniru endpoint Google yang dipakai BranchSync dan mencatat permintaan yang masuk.
type fakeGoogle struct {
	mu        sync.Mutex
	srv       *httptest.Server
	calls     []string // "METHOD path?query"
	bodies    map[string][]string
	locations map[string]map[string]any // "locations/1" → Location
	updated   map[string]map[string]any // getGoogleUpdated: {location, diffMask}
	vom       map[string]map[string]any
	reviews   map[string][]map[string]any // "locations/1" → reviews
	nextLoc   int
}

func newFakeGoogle() *fakeGoogle {
	f := &fakeGoogle{bodies: map[string][]string{}, locations: map[string]map[string]any{}, updated: map[string]map[string]any{},
		vom: map[string]map[string]any{}, reviews: map[string][]map[string]any{}, nextLoc: 100}
	f.locations["locations/1"] = map[string]any{"name": "locations/1", "title": "KC Google Satu", "storeCode": "G-001",
		"phoneNumbers": map[string]any{"primaryPhone": "(021) 555"}, "latlng": map[string]any{"latitude": -6.2, "longitude": 106.8},
		"storefrontAddress": map[string]any{"addressLines": []string{"Jl. Google 1"}, "locality": "Jakarta", "administrativeArea": "DKI Jakarta"},
		"regularHours":      map[string]any{"periods": []map[string]any{{"openDay": "MONDAY", "openTime": map[string]int{"hours": 8}, "closeDay": "MONDAY", "closeTime": map[string]int{"hours": 15}}}},
		"metadata":          map[string]any{"hasVoiceOfMerchant": true}}
	f.locations["locations/2"] = map[string]any{"name": "locations/2", "title": "Tanpa Koordinat"} // dilewati saat impor
	f.vom["locations/1"] = map[string]any{"hasVoiceOfMerchant": true}
	f.reviews["locations/1"] = []map[string]any{{"name": "accounts/1/locations/1/reviews/r1", "reviewId": "r1", "reviewer": map[string]any{"displayName": "Budi"},
		"starRating": "FOUR", "comment": "Pelayanan cepat", "createTime": "2026-11-10T03:00:00Z", "updateTime": "2026-11-10T03:00:00Z"}}
	f.srv = httptest.NewServer(http.HandlerFunc(f.handle))
	return f
}

func (f *fakeGoogle) endpoints() config.GoogleEndpoints {
	u := f.srv.URL
	return config.GoogleEndpoints{AuthURL: u + "/auth", TokenURL: u + "/token", UserInfoURL: u + "/userinfo",
		AccountsAPI: u + "/acct", BusinessInfoAPI: u + "/bi", ReviewsAPI: u + "/v4", VerificationsAPI: u + "/verif", NotificationsAPI: u + "/notif"}
}

func (f *fakeGoogle) count(prefix string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}

func (f *fakeGoogle) lastBody(prefix string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, v := range f.bodies {
		if strings.HasPrefix(k, prefix) && len(v) > 0 {
			return v[len(v)-1]
		}
	}
	return ""
}

func (f *fakeGoogle) handle(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	key := r.Method + " " + r.URL.Path
	f.mu.Lock()
	f.calls = append(f.calls, key+"?"+r.URL.RawQuery)
	f.bodies[key] = append(f.bodies[key], string(body))
	f.mu.Unlock()
	js := func(v any) { w.Header().Set("Content-Type", "application/json"); _ = json.NewEncoder(w).Encode(v) }
	p := r.URL.Path
	if p != "/token" && p != "/userinfo" && r.Header.Get("Authorization") != "Bearer access-123" {
		w.WriteHeader(401)
		js(map[string]any{"error": map[string]any{"code": 401, "message": "no auth", "status": "UNAUTHENTICATED"}})
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case p == "/token":
		_ = r.ParseForm()
		if r.Form.Get("grant_type") == "authorization_code" && r.Form.Get("code") != "good-code" {
			w.WriteHeader(400)
			js(map[string]string{"error": "invalid_grant"})
			return
		}
		js(map[string]any{"access_token": "access-123", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "refresh-xyz"})
	case p == "/userinfo":
		js(map[string]any{"email": "admin@bri.test", "email_verified": true})
	case p == "/acct/accounts":
		js(map[string]any{"accounts": []map[string]any{{"name": "accounts/1", "accountName": "BRI Regional Uji", "type": "LOCATION_GROUP"}}})
	case p == "/bi/accounts/1/locations" && r.Method == "GET":
		var list []map[string]any
		for _, l := range f.locations {
			list = append(list, l)
		}
		js(map[string]any{"locations": list})
	case p == "/bi/accounts/1/locations" && r.Method == "POST":
		var loc map[string]any
		_ = json.Unmarshal(body, &loc)
		f.nextLoc++
		name := "locations/" + itoa(f.nextLoc)
		loc["name"] = name
		f.locations[name] = loc
		f.vom[name] = map[string]any{"verify": map[string]any{}}
		js(loc)
	case strings.HasPrefix(p, "/bi/locations/") && strings.HasSuffix(p, ":getGoogleUpdated"):
		name := strings.TrimSuffix(strings.TrimPrefix(p, "/bi/"), ":getGoogleUpdated")
		if u, ok := f.updated[name]; ok {
			js(u)
			return
		}
		js(map[string]any{"location": f.locations[name], "diffMask": ""})
	case strings.HasPrefix(p, "/bi/locations/") && r.Method == "GET":
		name := strings.TrimPrefix(p, "/bi/")
		if l, ok := f.locations[name]; ok {
			js(l)
			return
		}
		w.WriteHeader(404)
		js(map[string]any{"error": map[string]any{"code": 404, "message": "not found"}})
	case strings.HasPrefix(p, "/bi/locations/") && r.Method == "PATCH":
		name := strings.TrimPrefix(p, "/bi/")
		var patch map[string]any
		_ = json.Unmarshal(body, &patch)
		for k, v := range patch {
			f.locations[name][k] = v
		}
		js(f.locations[name])
	case strings.HasPrefix(p, "/verif/locations/"):
		name := strings.TrimSuffix(strings.TrimPrefix(p, "/verif/"), "/VoiceOfMerchantState")
		js(f.vom[name])
	case strings.HasPrefix(p, "/v4/accounts/1/locations/") && strings.HasSuffix(p, "/reviews"):
		name := strings.TrimSuffix(strings.TrimPrefix(p, "/v4/accounts/1/"), "/reviews")
		js(map[string]any{"reviews": f.reviews[name]})
	case strings.HasSuffix(p, "/reply"):
		w.WriteHeader(200)
		js(map[string]any{"comment": "ok"})
	case strings.HasPrefix(p, "/notif/"):
		js(map[string]any{})
	default:
		w.WriteHeader(404)
		js(map[string]any{"error": map[string]any{"code": 404, "message": "unknown " + key}})
	}
}

func itoa(n int) string { return strconv.Itoa(n) }
