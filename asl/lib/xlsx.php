<?php
/**
 * Minimal XLSX writer/reader (no external libraries — uses ZipArchive).
 * Writes: multiple sheets from arrays of rows (first row = headers).
 * Reads: all sheets back into arrays of rows (strings).
 * Designed for the ASL Hub export/import round-trip.
 */

function aslhub_xlsx_write(string $path, array $sheets): bool {
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) return false;

    $sheetNames = array_keys($sheets);
    $n = count($sheetNames);

    $zip->addFromString('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' .
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' .
        '<Default Extension="xml" ContentType="application/xml"/>' .
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' .
        implode('', array_map(fn($i) =>
            '<Override PartName="/xl/worksheets/sheet' . ($i + 1) . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
            range(0, $n - 1))) .
        '</Types>');

    $zip->addFromString('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' .
        '</Relationships>');

    $sheetsXml = '';
    $relsXml = '';
    foreach ($sheetNames as $i => $name) {
        $sid = $i + 1;
        $safe = htmlspecialchars(mb_substr($name, 0, 31), ENT_XML1);
        $sheetsXml .= "<sheet name=\"$safe\" sheetId=\"$sid\" r:id=\"rId$sid\"/>";
        $relsXml .= "<Relationship Id=\"rId$sid\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet$sid.xml\"/>";
    }

    $zip->addFromString('xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' .
        "<sheets>$sheetsXml</sheets></workbook>");

    $zip->addFromString('xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $relsXml . '</Relationships>');

    foreach (array_values($sheets) as $i => $rows) {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($rows as $r => $row) {
            $xml .= '<row r="' . ($r + 1) . '">';
            $c = 0;
            foreach ($row as $value) {
                $ref = aslhub_xlsx_col($c) . ($r + 1);
                if ($value === null || $value === '') {
                    // skip empty cells
                } elseif (is_int($value) || is_float($value) || (is_string($value) && preg_match('/^-?\d+(\.\d+)?$/', $value) && strlen($value) < 15 && $value[0] !== '0')) {
                    $xml .= "<c r=\"$ref\"><v>" . $value . '</v></c>';
                } else {
                    $xml .= "<c r=\"$ref\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" .
                        htmlspecialchars((string)$value, ENT_XML1, 'UTF-8') . '</t></is></c>';
                }
                $c++;
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData></worksheet>';
        $zip->addFromString('xl/worksheets/sheet' . ($i + 1) . '.xml', $xml);
    }

    return $zip->close();
}

function aslhub_xlsx_col(int $index): string {
    $col = '';
    $index++;
    while ($index > 0) {
        $mod = ($index - 1) % 26;
        $col = chr(65 + $mod) . $col;
        $index = intdiv($index - 1, 26);
    }
    return $col;
}

/** Read an xlsx into ['SheetName' => [[row], [row], ...]] (values as strings). */
function aslhub_xlsx_read(string $path): array {
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('Could not open the uploaded file. Is it a .xlsx?');

    // shared strings (Excel saves strings there; our own writer uses inline strings)
    $shared = [];
    if (($ss = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
        $sx = new SimpleXMLElement($ss);
        foreach ($sx->si as $si) {
            if (isset($si->t)) { $shared[] = (string)$si->t; }
            else { // rich text runs
                $txt = '';
                foreach ($si->r as $run) $txt .= (string)$run->t;
                $shared[] = $txt;
            }
        }
    }

    // sheet name -> file mapping via workbook + rels
    $wb = new SimpleXMLElement($zip->getFromName('xl/workbook.xml'));
    $rels = new SimpleXMLElement($zip->getFromName('xl/_rels/workbook.xml.rels'));
    $relMap = [];
    foreach ($rels->Relationship as $rel) {
        $relMap[(string)$rel['Id']] = 'xl/' . ltrim((string)$rel['Target'], '/');
    }

    $out = [];
    foreach ($wb->sheets->sheet as $sheet) {
        $name = (string)$sheet['name'];
        $rid = (string)$sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
        $file = $relMap[$rid] ?? null;
        if (!$file || ($xml = $zip->getFromName($file)) === false) continue;

        $sx = new SimpleXMLElement($xml);
        $rows = [];
        foreach ($sx->sheetData->row as $row) {
            $cells = [];
            foreach ($row->c as $c) {
                $ref = (string)$c['r'];
                preg_match('/^([A-Z]+)/', $ref, $m);
                $colIdx = 0;
                foreach (str_split($m[1]) as $ch) $colIdx = $colIdx * 26 + (ord($ch) - 64);
                $colIdx--;
                $type = (string)$c['t'];
                if ($type === 's') $val = $shared[(int)$c->v] ?? '';
                elseif ($type === 'inlineStr') $val = (string)$c->is->t;
                else $val = isset($c->v) ? (string)$c->v : '';
                $cells[$colIdx] = $val;
            }
            if ($cells) {
                $max = max(array_keys($cells));
                $full = array_fill(0, $max + 1, '');
                foreach ($cells as $i => $v) $full[$i] = $v;
                $rows[] = $full;
            } else {
                $rows[] = [];
            }
        }
        $out[$name] = $rows;
    }
    $zip->close();
    return $out;
}

/** Rows-with-headers helper: [[h1,h2],[a,b]] -> [['h1'=>a,'h2'=>b]] */
function aslhub_sheet_assoc(array $rows): array {
    if (count($rows) < 2) return [];
    $headers = array_map('trim', $rows[0]);
    $out = [];
    for ($i = 1; $i < count($rows); $i++) {
        $row = [];
        foreach ($headers as $j => $h) {
            if ($h === '') continue;
            $row[$h] = $rows[$i][$j] ?? '';
        }
        if (array_filter($row, fn($v) => trim((string)$v) !== '')) $out[] = $row;
    }
    return $out;
}
