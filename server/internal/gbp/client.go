// Package gbp adalah klien Google Business Profile APIs yang dipakai BranchSync:
//   - Account Management  : daftar akun
//   - Business Information: daftar/baca/ubah/buat lokasi, perubahan dari Google (getGoogleUpdated)
//   - Verifications       : status Voice of Merchant (terverifikasi / suspend / menunggu)
//   - Notifications       : arahkan notifikasi (ulasan baru, edit Google) ke Pub/Sub
//   - My Business v4      : ulasan dan balasan ulasan
//
// Klien menerima *http.Client yang sudah diotorisasi OAuth (scope business.manage).
package gbp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"branchsync/server/internal/config"
	"branchsync/server/internal/hours"
)

type Client struct {
	HTTP *http.Client
	EP   config.GoogleEndpoints
	// BeforeCall dipanggil sebelum setiap permintaan (penghitungan kuota). Mengembalikan error = batalkan.
	BeforeCall func(ctx context.Context) error
}

// APIError adalah galat dari Google; Message sudah ramah pengguna.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string { return e.Message }

const locationReadMask = "name,title,storeCode,phoneNumbers,storefrontAddress,latlng,regularHours,categories,metadata,openInfo"

// ---- Tipe data Google ----

type Account struct {
	Name        string `json:"name"` // accounts/123
	AccountName string `json:"accountName"`
	Type        string `json:"type"`
}

type PhoneNumbers struct {
	PrimaryPhone string `json:"primaryPhone,omitempty"`
}
type PostalAddress struct {
	RegionCode         string   `json:"regionCode,omitempty"`
	LanguageCode       string   `json:"languageCode,omitempty"`
	PostalCode         string   `json:"postalCode,omitempty"`
	AdministrativeArea string   `json:"administrativeArea,omitempty"`
	Locality           string   `json:"locality,omitempty"`
	AddressLines       []string `json:"addressLines,omitempty"`
}
type LatLng struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}
type RegularHours struct {
	Periods []hours.Period `json:"periods"`
}
type Category struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
}
type Categories struct {
	PrimaryCategory Category `json:"primaryCategory"`
}
type Metadata struct {
	PlaceID            string `json:"placeId,omitempty"`
	MapsURI            string `json:"mapsUri,omitempty"`
	DuplicateLocation  string `json:"duplicateLocation,omitempty"`
	HasVoiceOfMerchant bool   `json:"hasVoiceOfMerchant,omitempty"`
	HasGoogleUpdated   bool   `json:"hasGoogleUpdated,omitempty"`
	HasPendingEdits    bool   `json:"hasPendingEdits,omitempty"`
}
type OpenInfo struct {
	Status string `json:"status,omitempty"` // OPEN | CLOSED_PERMANENTLY | CLOSED_TEMPORARILY
}

type Location struct {
	Name              string         `json:"name,omitempty"` // locations/456
	Title             string         `json:"title,omitempty"`
	StoreCode         string         `json:"storeCode,omitempty"`
	LanguageCode      string         `json:"languageCode,omitempty"`
	PhoneNumbers      *PhoneNumbers  `json:"phoneNumbers,omitempty"`
	StorefrontAddress *PostalAddress `json:"storefrontAddress,omitempty"`
	Latlng            *LatLng        `json:"latlng,omitempty"`
	RegularHours      *RegularHours  `json:"regularHours,omitempty"`
	Categories        *Categories    `json:"categories,omitempty"`
	Metadata          *Metadata      `json:"metadata,omitempty"`
	OpenInfo          *OpenInfo      `json:"openInfo,omitempty"`
}

type GoogleUpdated struct {
	Location    Location `json:"location"`
	DiffMask    string   `json:"diffMask"`
	PendingMask string   `json:"pendingMask"`
}

type VoiceOfMerchant struct {
	HasVoiceOfMerchant       bool            `json:"hasVoiceOfMerchant"`
	HasBusinessAuthority     bool            `json:"hasBusinessAuthority"`
	WaitForVoiceOfMerchant   json.RawMessage `json:"waitForVoiceOfMerchant,omitempty"`
	Verify                   json.RawMessage `json:"verify,omitempty"`
	ResolveOwnershipConflict json.RawMessage `json:"resolveOwnershipConflict,omitempty"`
	ComplyWithGuidelines     json.RawMessage `json:"complyWithGuidelines,omitempty"`
}

type Review struct {
	Name     string `json:"name"` // accounts/1/locations/2/reviews/abc
	ReviewID string `json:"reviewId"`
	Reviewer struct {
		DisplayName string `json:"displayName"`
		IsAnonymous bool   `json:"isAnonymous"`
	} `json:"reviewer"`
	StarRating  string    `json:"starRating"` // ONE..FIVE
	Comment     string    `json:"comment"`
	CreateTime  time.Time `json:"createTime"`
	UpdateTime  time.Time `json:"updateTime"`
	ReviewReply *struct {
		Comment    string    `json:"comment"`
		UpdateTime time.Time `json:"updateTime"`
	} `json:"reviewReply"`
}

// ---- Permintaan ----

func (c *Client) do(ctx context.Context, method, rawURL string, body, out any) error {
	if c.BeforeCall != nil {
		if err := c.BeforeCall(ctx); err != nil {
			return err
		}
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, rd)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		if strings.Contains(err.Error(), "oauth2") {
			return &APIError{Status: 401, Code: "auth", Message: "Token Google tidak valid atau dicabut — hubungkan ulang akun Google di Integrasi Google."}
		}
		return &APIError{Code: "network", Message: "Tidak dapat menghubungi Google: " + err.Error()}
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode >= 300 {
		var ge struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
				Status  string `json:"status"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &ge)
		msg := ge.Error.Message
		if msg == "" {
			msg = http.StatusText(res.StatusCode)
		}
		return &APIError{Status: res.StatusCode, Code: ge.Error.Status, Message: friendly(res.StatusCode, msg)}
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

func friendly(status int, msg string) string {
	switch status {
	case 401:
		return "Google menolak otorisasi — hubungkan ulang akun Google. (" + msg + ")"
	case 403:
		return "Akses Google ditolak — pastikan API Business Profile sudah diaktifkan dan akun punya akses ke lokasi ini. (" + msg + ")"
	case 404:
		return "Data tidak ditemukan di Google. (" + msg + ")"
	case 429:
		return "Kuota Google API habis untuk sementara — coba lagi nanti. (" + msg + ")"
	}
	if status >= 500 {
		return "Layanan Google sedang bermasalah — coba lagi nanti. (" + msg + ")"
	}
	return "Google menolak permintaan: " + msg
}

func (c *Client) ListAccounts(ctx context.Context) ([]Account, error) {
	var all []Account
	token := ""
	for {
		var res struct {
			Accounts      []Account `json:"accounts"`
			NextPageToken string    `json:"nextPageToken"`
		}
		u := c.EP.AccountsAPI + "/accounts?pageSize=20"
		if token != "" {
			u += "&pageToken=" + url.QueryEscape(token)
		}
		if err := c.do(ctx, http.MethodGet, u, nil, &res); err != nil {
			return nil, err
		}
		all = append(all, res.Accounts...)
		if token = res.NextPageToken; token == "" {
			return all, nil
		}
	}
}

func (c *Client) ListLocations(ctx context.Context, account string) ([]Location, error) {
	var all []Location
	token := ""
	for {
		var res struct {
			Locations     []Location `json:"locations"`
			NextPageToken string     `json:"nextPageToken"`
		}
		u := fmt.Sprintf("%s/%s/locations?pageSize=100&readMask=%s", c.EP.BusinessInfoAPI, account, locationReadMask)
		if token != "" {
			u += "&pageToken=" + url.QueryEscape(token)
		}
		if err := c.do(ctx, http.MethodGet, u, nil, &res); err != nil {
			return nil, err
		}
		all = append(all, res.Locations...)
		if token = res.NextPageToken; token == "" {
			return all, nil
		}
	}
}

func (c *Client) GetLocation(ctx context.Context, name string) (*Location, error) {
	var loc Location
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("%s/%s?readMask=%s", c.EP.BusinessInfoAPI, name, locationReadMask), nil, &loc)
	return &loc, err
}

// GetGoogleUpdated mengembalikan versi listing yang diperbarui Google/pengguna lain beserta kolom yang berbeda.
func (c *Client) GetGoogleUpdated(ctx context.Context, name string) (*GoogleUpdated, error) {
	var g GoogleUpdated
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("%s/%s:getGoogleUpdated?readMask=%s", c.EP.BusinessInfoAPI, name, locationReadMask), nil, &g)
	return &g, err
}

func (c *Client) PatchLocation(ctx context.Context, name string, loc *Location, mask []string) (*Location, error) {
	var out Location
	err := c.do(ctx, http.MethodPatch, fmt.Sprintf("%s/%s?updateMask=%s", c.EP.BusinessInfoAPI, name, url.QueryEscape(strings.Join(mask, ","))), loc, &out)
	return &out, err
}

func (c *Client) CreateLocation(ctx context.Context, account string, loc *Location, requestID string) (*Location, error) {
	var out Location
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("%s/%s/locations?requestId=%s", c.EP.BusinessInfoAPI, account, url.QueryEscape(requestID)), loc, &out)
	return &out, err
}

func (c *Client) VoiceOfMerchant(ctx context.Context, name string) (*VoiceOfMerchant, error) {
	var v VoiceOfMerchant
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("%s/%s/VoiceOfMerchantState", c.EP.VerificationsAPI, name), nil, &v)
	return &v, err
}

// ListReviews: account "accounts/1", location "locations/2".
func (c *Client) ListReviews(ctx context.Context, account, location string) ([]Review, error) {
	var all []Review
	token := ""
	for {
		var res struct {
			Reviews       []Review `json:"reviews"`
			NextPageToken string   `json:"nextPageToken"`
		}
		u := fmt.Sprintf("%s/%s/%s/reviews?pageSize=50", c.EP.ReviewsAPI, account, location)
		if token != "" {
			u += "&pageToken=" + url.QueryEscape(token)
		}
		if err := c.do(ctx, http.MethodGet, u, nil, &res); err != nil {
			return nil, err
		}
		all = append(all, res.Reviews...)
		if token = res.NextPageToken; token == "" || len(all) >= 500 {
			return all, nil
		}
	}
}

func (c *Client) UpdateReply(ctx context.Context, reviewName, text string) error {
	return c.do(ctx, http.MethodPut, fmt.Sprintf("%s/%s/reply", c.EP.ReviewsAPI, reviewName), map[string]string{"comment": text}, nil)
}

func (c *Client) DeleteReply(ctx context.Context, reviewName string) error {
	return c.do(ctx, http.MethodDelete, fmt.Sprintf("%s/%s/reply", c.EP.ReviewsAPI, reviewName), nil, nil)
}

// UpdateNotifications mengarahkan notifikasi akun ke topik Pub/Sub (kosong = matikan).
func (c *Client) UpdateNotifications(ctx context.Context, account, topic string) error {
	types := []string{"GOOGLE_UPDATE", "NEW_REVIEW", "UPDATED_REVIEW", "VOICE_OF_MERCHANT_UPDATED", "DUPLICATE_LOCATION"}
	if topic == "" {
		types = []string{}
	}
	body := map[string]any{"name": account + "/notificationSetting", "pubsubTopic": topic, "notificationTypes": types}
	return c.do(ctx, http.MethodPatch, fmt.Sprintf("%s/%s/notificationSetting?updateMask=notificationTypes,pubsubTopic", c.EP.NotificationsAPI, account), body, nil)
}
