<?php
/** Read Skyward SpreadsheetML exports; filenames supply course and period. */
function aslhub_roster_name(string $name): array {
    $name = trim($name);
    if (preg_match('/^(.+?)\s+[\p{L}]\.\s+(.+)$/u', $name, $m)) return [$m[1], $m[2]];
    $parts = preg_split('/\s+/u', $name, 2);
    if (count($parts) !== 2 || $parts[1] === '') throw new RuntimeException('Roster name cannot be separated.');
    return $parts;
}

function aslhub_read_rosters(string $directory): array {
    $files = glob(rtrim($directory, '/\\') . '/*.xls');
    if (!$files) throw new RuntimeException('No roster exports found.');
    sort($files);
    $students = []; $names = []; $ids = []; $emails = []; $groups = [];
    foreach ($files as $file) {
        if (!preg_match('/^period\s+([1-6])\s+asl\s+([1-3])\s*\.xls$/i', basename($file), $m)) throw new RuntimeException('Roster filename must identify period and ASL level: ' . basename($file));
        $period = (int)$m[1]; $level = (int)$m[2];
        $xml = new DOMDocument();
        if (!$xml->load($file, LIBXML_NONET) || $xml->doctype) throw new RuntimeException('Invalid roster XML.');
        $xp = new DOMXPath($xml); $xp->registerNamespace('s', 'urn:schemas-microsoft-com:office:spreadsheet');
        $active = false; $count = 0;
        foreach ($xp->query('//s:Row') as $row) {
            $cells = [];
            foreach ($xp->query('s:Cell', $row) as $cell) {
                $index = $cell->getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet', 'Index');
                if ($index !== '') while (count($cells) < (int)$index - 1) $cells[] = '';
                $cells[] = $xp->evaluate('string(s:Data)', $cell);
            }
            if (($cells[0] ?? '') === 'First MI Last') {
                if (($cells[1] ?? '') !== 'Student ID' || ($cells[2] ?? '') !== 'Email') throw new RuntimeException('Unexpected roster columns.');
                $active = true; continue;
            }
            if (!$active || !$cells || trim(implode('', $cells)) === '') continue;
            if (!preg_match('/^\d+$/', $cells[1] ?? '')) throw new RuntimeException('Unexpected row after roster header.');
            [$first, $last] = aslhub_roster_name($cells[0]);
            $email = trim($cells[2] ?? ''); $id = $cells[1];
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Missing or invalid roster email.');
            $key = mb_strtolower($first . '|' . $last, 'UTF-8');
            if (isset($names[$key]) || isset($ids[$id]) || isset($emails[strtolower($email)])) throw new RuntimeException('Duplicate roster identity; no accounts imported.');
            if ($key === 'test|test' || $key === 'brandon|harms') throw new RuntimeException('Roster collides with a retained account.');
            $names[$key] = $ids[$id] = $emails[strtolower($email)] = true;
            $students[] = ['first_name'=>$first, 'last_name'=>$last, 'email'=>$email, 'skyward_student_id'=>$id, 'class_period'=>$period, 'level'=>$level];
            $count++;
        }
        if (!$count) throw new RuntimeException('Empty roster: ' . basename($file));
        $groups[] = ['file'=>basename($file), 'period'=>$period, 'level'=>$level, 'students'=>$count];
    }
    return ['students'=>$students, 'groups'=>$groups];
}
