// Package pdf membuat dokumen PDF teks sederhana (laporan terjadwal) tanpa pustaka eksternal.
package pdf

import (
	"bytes"
	"fmt"
	"strings"
)

// Line adalah satu baris laporan. Bold untuk judul.
type Line struct {
	Text string
	Bold bool
	Size float64 // 0 = 10pt
}

const (
	pageW, pageH   = 595.0, 842.0 // A4 dalam point
	margin         = 50.0
	defaultSize    = 10.0
	lineGapFactor  = 1.45
	maxCharsAt10pt = 95
)

// Render menyusun baris-baris menjadi PDF A4 multi-halaman (Helvetica, encoding WinAnsi).
func Render(title string, lines []Line) []byte {
	var pages [][]string
	var cur []string
	y := pageH - margin
	newPage := func() {
		if cur != nil {
			pages = append(pages, cur)
		}
		cur = []string{}
		y = pageH - margin
	}
	newPage()
	for _, ln := range lines {
		size := ln.Size
		if size == 0 {
			size = defaultSize
		}
		for _, part := range wrapText(ln.Text, int(maxCharsAt10pt*defaultSize/size)) {
			if y-size < margin {
				newPage()
			}
			y -= size * lineGapFactor
			font := "/F1"
			if ln.Bold {
				font = "/F2"
			}
			cur = append(cur, fmt.Sprintf("BT %s %.1f Tf %.1f %.1f Td (%s) Tj ET", font, size, margin, y, escape(part)))
		}
	}
	pages = append(pages, cur)

	var b bytes.Buffer
	var offsets []int
	obj := func(body string) {
		offsets = append(offsets, b.Len())
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", len(offsets), body)
	}
	b.WriteString("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
	n := len(pages)
	// 1 katalog, 2 pages, 3 font, 4 font bold, 5 info, lalu (page, content) per halaman
	kids := make([]string, n)
	for i := range pages {
		kids[i] = fmt.Sprintf("%d 0 R", 6+i*2)
	}
	obj("<< /Type /Catalog /Pages 2 0 R >>")
	obj(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), n))
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
	obj(fmt.Sprintf("<< /Title (%s) /Producer (BranchSync) >>", escape(title)))
	for i, p := range pages {
		footer := fmt.Sprintf("BT /F1 8 Tf %.1f %.1f Td (%s) Tj ET", margin, margin/2, escape(fmt.Sprintf("%s - halaman %d dari %d", title, i+1, n)))
		content := strings.Join(append(p, footer), "\n")
		obj(fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.0f %.0f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>", pageW, pageH, 7+i*2))
		obj(fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content))
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(offsets)+1)
	for _, o := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R /Info 5 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets)+1, xref)
	return b.Bytes()
}

// escape mengubah teks ke WinAnsi dan meng-escape karakter khusus PDF.
func escape(s string) string {
	repl := map[rune]byte{'–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80}
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '(' || r == ')' || r == '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r < 0x80:
			b.WriteRune(r)
		case repl[r] != 0:
			fmt.Fprintf(&b, "\\%03o", repl[r])
		case r <= 0xFF:
			fmt.Fprintf(&b, "\\%03o", r)
		default:
			b.WriteByte('?')
		}
	}
	return b.String()
}

func wrapText(s string, width int) []string {
	if len([]rune(s)) <= width {
		return []string{s}
	}
	var out []string
	var line []string
	n := 0
	for _, w := range strings.Fields(s) {
		if n+len([]rune(w))+1 > width && len(line) > 0 {
			out = append(out, strings.Join(line, " "))
			line, n = nil, 0
		}
		line = append(line, w)
		n += len([]rune(w)) + 1
	}
	if len(line) > 0 {
		out = append(out, strings.Join(line, " "))
	}
	return out
}
