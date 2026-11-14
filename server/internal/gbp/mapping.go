package gbp

import (
	"strings"

	"branchsync/server/internal/hours"
)

// Snapshot adalah bentuk "google" pada unit di /bootstrap: data listing seperti yang tampil di Google.
type Snapshot struct {
	Name    string  `json:"name"`
	Phone   string  `json:"phone"`
	Hours   string  `json:"hours"`
	Address string  `json:"address"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
}

// ToSnapshot. Bila Google tidak mengirim latlng, koordinat Dashboard dipakai (tidak dianggap beda).
func ToSnapshot(l *Location, fallbackLat, fallbackLng float64) Snapshot {
	s := Snapshot{Name: l.Title, Lat: fallbackLat, Lng: fallbackLng}
	if l.PhoneNumbers != nil {
		s.Phone = l.PhoneNumbers.PrimaryPhone
	}
	if l.RegularHours != nil {
		s.Hours = hours.Format(hours.FromGoogle(l.RegularHours.Periods))
	}
	if l.StorefrontAddress != nil {
		s.Address = strings.Join(l.StorefrontAddress.AddressLines, ", ")
	}
	if l.Latlng != nil && (l.Latlng.Latitude != 0 || l.Latlng.Longitude != 0) {
		s.Lat, s.Lng = l.Latlng.Latitude, l.Latlng.Longitude
	}
	return s
}

// Unit adalah data Dashboard yang dikirim ke Google.
type Unit struct {
	Code, Name, Type, City, Province, Address, Phone, HoursText string
	HoursSpec                                                   hours.Spec
	Lat, Lng                                                    float64
}

// FieldMask: kolom Dashboard → updateMask Google. Koordinat tidak dikirim lewat PATCH (hanya klien
// yang disetujui Google boleh mengubah latlng); Google menentukan titik dari alamat.
var FieldMask = map[string]string{"name": "title", "phone": "phoneNumbers", "hours": "regularHours", "address": "storefrontAddress"}

// CategoryFor: kategori utama Google untuk tipe unit BRI.
func CategoryFor(unitType string) string {
	if unitType == "ATM" {
		return "categories/gcid:atm"
	}
	return "categories/gcid:bank"
}

// ToGoogle membangun Location (untuk create bila fields kosong) dan updateMask untuk kolom yang diminta.
func ToGoogle(u Unit, fields []string) (*Location, []string) {
	spec := u.HoursSpec
	if spec == nil {
		spec, _ = hours.Parse(u.HoursText)
	}
	l := &Location{}
	var mask []string
	all := len(fields) == 0
	want := func(f string) bool {
		if all {
			return true
		}
		for _, x := range fields {
			if x == f {
				return true
			}
		}
		return false
	}
	if want("name") {
		l.Title = u.Name
		mask = append(mask, FieldMask["name"])
	}
	if want("phone") {
		l.PhoneNumbers = &PhoneNumbers{PrimaryPhone: u.Phone}
		mask = append(mask, FieldMask["phone"])
	}
	if want("hours") {
		l.RegularHours = &RegularHours{Periods: hours.ToGoogle(spec)}
		mask = append(mask, FieldMask["hours"])
	}
	if want("address") {
		l.StorefrontAddress = &PostalAddress{RegionCode: "ID", LanguageCode: "id", AdministrativeArea: u.Province, Locality: u.City, AddressLines: []string{u.Address}}
		mask = append(mask, FieldMask["address"])
	}
	if all {
		l.StoreCode = u.Code
		l.LanguageCode = "id"
		l.Categories = &Categories{PrimaryCategory: Category{Name: CategoryFor(u.Type)}}
		l.Latlng = &LatLng{Latitude: u.Lat, Longitude: u.Lng}
		mask = nil
	}
	return l, mask
}

// Status menerjemahkan status Google ke status GBP di Dashboard.
func Status(v *VoiceOfMerchant, meta *Metadata) string {
	if meta != nil && meta.DuplicateLocation != "" {
		return "Duplikat"
	}
	if v == nil {
		return ""
	}
	switch {
	case len(v.ComplyWithGuidelines) > 0:
		return "Suspend"
	case v.HasVoiceOfMerchant:
		return "Terverifikasi"
	case len(v.Verify) > 0 || len(v.WaitForVoiceOfMerchant) > 0:
		return "Menunggu Verifikasi"
	default:
		return "Belum Diklaim"
	}
}

// Rating "ONE".."FIVE" → 1..5.
func Rating(s string) int {
	return map[string]int{"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}[s]
}

// DiffFields memetakan diffMask Google ("title,phoneNumbers.primaryPhone") ke kolom Dashboard.
func DiffFields(mask string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range strings.Split(mask, ",") {
		m = strings.TrimSpace(m)
		var f string
		switch {
		case strings.HasPrefix(m, "title"):
			f = "name"
		case strings.HasPrefix(m, "phoneNumbers"):
			f = "phone"
		case strings.HasPrefix(m, "regularHours"):
			f = "hours"
		case strings.HasPrefix(m, "storefrontAddress"):
			f = "address"
		case strings.HasPrefix(m, "latlng"):
			f = "coords"
		}
		if f != "" && !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	return out
}
