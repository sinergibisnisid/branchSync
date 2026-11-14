// Package hours mengelola jam operasional: format editor frontend (hoursSpec), teks ringkasan
// (harus identik dengan formatHours/parseHours di admin/forms.js), dan regularHours Google.
package hours

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Range struct {
	From string `json:"from"` // "08:00"
	To   string `json:"to"`   // "15:00"
}

type Day struct {
	Open   bool    `json:"open"`
	H24    bool    `json:"h24"`
	Ranges []Range `json:"ranges"`
}

// Spec: kunci mon..sun.
type Spec map[string]*Day

var Days = []struct{ Key, Name, Short, Google string }{
	{"mon", "Senin", "Sen", "MONDAY"}, {"tue", "Selasa", "Sel", "TUESDAY"}, {"wed", "Rabu", "Rab", "WEDNESDAY"},
	{"thu", "Kamis", "Kam", "THURSDAY"}, {"fri", "Jumat", "Jum", "FRIDAY"}, {"sat", "Sabtu", "Sab", "SATURDAY"}, {"sun", "Minggu", "Min", "SUNDAY"},
}

func Blank() Spec {
	s := Spec{}
	for _, d := range Days {
		s[d.Key] = &Day{Ranges: []Range{}}
	}
	return s
}

// Normalize melengkapi hari yang hilang (data dari klien bisa tidak lengkap).
func (s Spec) Normalize() Spec {
	out := Blank()
	for k, d := range s {
		if d != nil && out[k] != nil {
			c := *d
			if c.Ranges == nil {
				c.Ranges = []Range{}
			}
			out[k] = &c
		}
	}
	return out
}

// Validate meniru hoursError di frontend; pesan dalam Bahasa Indonesia.
func (s Spec) Validate() error {
	s = s.Normalize()
	anyOpen := false
	for _, d := range Days {
		x := s[d.Key]
		if !x.Open {
			continue
		}
		anyOpen = true
		if x.H24 {
			continue
		}
		if len(x.Ranges) == 0 {
			return fmt.Errorf("Jam operasional %s: isi jam buka atau pilih 24 jam.", d.Name)
		}
		rs := append([]Range(nil), x.Ranges...)
		sort.Slice(rs, func(i, j int) bool { return rs[i].From < rs[j].From })
		for i, r := range rs {
			if !validTime(r.From) || !validTime(r.To) {
				return fmt.Errorf("Jam operasional %s: lengkapi jam buka dan tutup.", d.Name)
			}
			if r.To <= r.From {
				return fmt.Errorf("Jam operasional %s: jam tutup harus setelah jam buka.", d.Name)
			}
			if i > 0 && r.From < rs[i-1].To {
				return fmt.Errorf("Jam operasional %s: rentang jam saling tumpang tindih.", d.Name)
			}
		}
	}
	if !anyOpen {
		return fmt.Errorf("Jam operasional: aktifkan minimal satu hari buka.")
	}
	return nil
}

var timeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func validTime(t string) bool { return timeRe.MatchString(t) }

// Format menghasilkan teks ringkasan, mis. "Sen–Jum 08.00–15.00; Sab 08.00–12.00".
func Format(s Spec) string {
	s = s.Normalize()
	sig := func(k string) string {
		d := s[k]
		if !d.Open {
			return "X"
		}
		if d.H24 {
			return "24"
		}
		parts := make([]string, len(d.Ranges))
		for i, r := range d.Ranges {
			parts[i] = r.From + "-" + r.To
		}
		return strings.Join(parts, ",")
	}
	txt := func(k string) string {
		d := s[k]
		if d.H24 {
			return "24 jam"
		}
		parts := make([]string, len(d.Ranges))
		for i, r := range d.Ranges {
			parts[i] = strings.Replace(r.From, ":", ".", 1) + "–" + strings.Replace(r.To, ":", ".", 1)
		}
		return strings.Join(parts, ", ")
	}
	if s["mon"].Open {
		same := true
		for _, d := range Days {
			if sig(d.Key) != sig("mon") {
				same = false
				break
			}
		}
		if same {
			return "Setiap hari " + txt("mon")
		}
	}
	type group struct{ sig, start, end, key string }
	var groups []*group
	for _, d := range Days {
		sg := sig(d.Key)
		if n := len(groups); n > 0 && groups[n-1].sig == sg {
			groups[n-1].end = d.Short
		} else {
			groups = append(groups, &group{sg, d.Short, d.Short, d.Key})
		}
	}
	var parts []string
	for _, g := range groups {
		if g.sig == "X" {
			continue
		}
		label := g.start
		if g.end != g.start {
			label += "–" + g.end
		}
		parts = append(parts, label+" "+txt(g.key))
	}
	if len(parts) == 0 {
		return "Tutup"
	}
	return strings.Join(parts, "; ")
}

var (
	everyRe = regexp.MustCompile(`(?i)^Setiap hari\s+(.+)$`)
	dayRe   = regexp.MustCompile(`^(Sen|Sel|Rab|Kam|Jum|Sab|Min)(?:\s*[–-]\s*(Sen|Sel|Rab|Kam|Jum|Sab|Min))?\s+(.+)$`)
	rangeRe = regexp.MustCompile(`(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})`)
	segSep  = regexp.MustCompile(`;\s*`)
)

// Parse membaca teks ringkasan (dari impor CSV/Excel). ok=false bila teks tidak dikenali.
func Parse(text string) (Spec, bool) {
	s := Blank()
	text = strings.TrimSpace(text)
	if text == "" {
		return s, false
	}
	short := func(x string) int {
		for i, d := range Days {
			if d.Short == x {
				return i
			}
		}
		return -1
	}
	ok := false
	for _, seg := range segSep.Split(text, -1) {
		var keys []string
		var rest string
		if m := everyRe.FindStringSubmatch(seg); m != nil {
			for _, d := range Days {
				keys = append(keys, d.Key)
			}
			rest = m[1]
		} else if m := dayRe.FindStringSubmatch(seg); m != nil {
			a, b := short(m[1]), short(m[1])
			if m[2] != "" {
				b = short(m[2])
			}
			for i := a; ; i = (i + 1) % 7 {
				keys = append(keys, Days[i].Key)
				if i == b {
					break
				}
			}
			rest = m[3]
		} else {
			continue
		}
		rest = strings.TrimSpace(rest)
		if strings.EqualFold(rest, "24 jam") {
			for _, k := range keys {
				*s[k] = Day{Open: true, H24: true, Ranges: []Range{}}
			}
			ok = true
			continue
		}
		if strings.EqualFold(rest, "tutup") {
			ok = true
			continue
		}
		var ranges []Range
		for _, r := range rangeRe.FindAllStringSubmatch(rest, -1) {
			ranges = append(ranges, Range{From: pad(r[1]) + ":" + r[2], To: pad(r[3]) + ":" + r[4]})
		}
		if len(ranges) == 0 {
			continue
		}
		for _, k := range keys {
			*s[k] = Day{Open: true, Ranges: append([]Range(nil), ranges...)}
		}
		ok = true
	}
	return s, ok
}

func pad(h string) string {
	if len(h) == 1 {
		return "0" + h
	}
	return h
}

// ---- Google regularHours ----

type TimeOfDay struct {
	Hours   int `json:"hours,omitempty"`
	Minutes int `json:"minutes,omitempty"`
}

type Period struct {
	OpenDay   string    `json:"openDay"`
	OpenTime  TimeOfDay `json:"openTime"`
	CloseDay  string    `json:"closeDay"`
	CloseTime TimeOfDay `json:"closeTime"`
}

func parseHM(t string) TimeOfDay {
	h, _ := strconv.Atoi(t[:2])
	m, _ := strconv.Atoi(t[3:])
	return TimeOfDay{Hours: h, Minutes: m}
}

// ToGoogle memetakan hoursSpec ke regularHours.periods. 24 jam = 00:00–24:00.
func ToGoogle(s Spec) []Period {
	s = s.Normalize()
	out := []Period{}
	for _, d := range Days {
		x := s[d.Key]
		if !x.Open {
			continue
		}
		if x.H24 {
			out = append(out, Period{OpenDay: d.Google, OpenTime: TimeOfDay{}, CloseDay: d.Google, CloseTime: TimeOfDay{Hours: 24}})
			continue
		}
		for _, r := range x.Ranges {
			out = append(out, Period{OpenDay: d.Google, OpenTime: parseHM(r.From), CloseDay: d.Google, CloseTime: parseHM(r.To)})
		}
	}
	return out
}

// FromGoogle mengubah regularHours.periods menjadi hoursSpec.
func FromGoogle(ps []Period) Spec {
	s := Blank()
	key := map[string]string{}
	for _, d := range Days {
		key[d.Google] = d.Key
	}
	hm := func(t TimeOfDay) string { return fmt.Sprintf("%02d:%02d", t.Hours, t.Minutes) }
	for _, p := range ps {
		k, ok := key[p.OpenDay]
		if !ok {
			continue
		}
		d := s[k]
		d.Open = true
		full := p.OpenTime.Hours == 0 && p.OpenTime.Minutes == 0 &&
			((p.CloseTime.Hours == 24 && p.CloseTime.Minutes == 0) || (p.CloseDay != p.OpenDay && p.CloseTime.Hours == 0 && p.CloseTime.Minutes == 0))
		if full {
			d.H24, d.Ranges = true, []Range{}
			continue
		}
		if d.H24 {
			continue
		}
		to := hm(p.CloseTime)
		if p.CloseDay != p.OpenDay || to == "24:00" {
			to = "23:59" // rentang melewati tengah malam dipotong di akhir hari (editor tidak mendukung lintas hari)
		}
		d.Ranges = append(d.Ranges, Range{From: hm(p.OpenTime), To: to})
	}
	for _, d := range s {
		sort.Slice(d.Ranges, func(i, j int) bool { return d.Ranges[i].From < d.Ranges[j].From })
	}
	return s
}
