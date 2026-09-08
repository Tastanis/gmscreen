<?php
declare(strict_types=1);
require_once __DIR__.'/../../../../character_sheet/AtomicJsonFile.php';
require_once __DIR__.'/../../../../character_sheet/CharacterWriteReceipts.php';
function receiptCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
define('HANDLER_INCLUDE_ONLY', true);
require_once __DIR__.'/../../../../character_sheet/handler.php';
$dir=sys_get_temp_dir().'/vtt-character-receipt-'.bin2hex(random_bytes(8));mkdir($dir);
$file=$dir.'/sheets.json';
try {
    $unavailable=false;
    try {loadCharacterSheetData($dir,$file,['cal'],false);} catch(RuntimeException $e) {$unavailable=true;}
    receiptCheck($unavailable && !file_exists($file),'Read-only receipt lookup never initializes absent character storage.');
    $data=['cal'=>['surges'=>2], 'sharon'=>['surges'=>7]];
    AtomicJsonFile::write($file,$data);
    $id=CharacterWriteReceipts::operationId('receipt-test-0001');
    receiptCheck(CharacterWriteReceipts::lookup($data,$id,'cal','cal','sync-surges',['delta'=>2])===null,'New operation is not a replay.');
    $data['cal']['surges']=4;
    $response=CharacterWriteReceipts::record($data,$id,'cal','cal','sync-surges',['delta'=>2],['success'=>true,'surges'=>4]);
    AtomicJsonFile::write($file,$data);
    $reopened=json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
    $result=CharacterWriteReceipts::lookup($reopened,$id,'cal','cal','sync-surges',['delta'=>2]);
    receiptCheck($result['replayed'] && $result['surges']===4 && $result['operationId']===$id,'Mutation and receipt survive reopening together.');
    $reopened['cal']['surges']=9;AtomicJsonFile::write($file,$reopened);
    receiptCheck(CharacterWriteReceipts::lookup($reopened,$id,'cal','cal','sync-surges',['delta'=>2])['surges']===4,'Receipt reports original outcome, not a second mutation.');
    foreach ([['GM','cal',['delta'=>2]],['cal','sharon',['delta'=>2]],['cal','cal',['delta'=>3]]] as [$actor,$character,$input]) {
        $rejected=false;try {CharacterWriteReceipts::lookup($reopened,$id,$actor,$character,'sync-surges',$input);}catch(InvalidArgumentException $e){$rejected=true;}
        receiptCheck($rejected,'Different actor, character or payload cannot reuse an operation.');
    }
    $beforeInspect = $reopened;
    receiptCheck(CharacterWriteReceipts::inspect($reopened,$id,'cal','cal',false)['response']['surges']===4,'Actor can inspect a saved result without replay.');
    receiptCheck(CharacterWriteReceipts::inspect($reopened,$id,'GM','cal',true)!==null,'GM can inspect a receipt.');
    receiptCheck(CharacterWriteReceipts::inspect($reopened,$id,'sharon','cal',false)===null,'Other players cannot inspect another actor receipt.');
    receiptCheck(CharacterWriteReceipts::inspect($reopened,$id,'cal','sharon',false)===null,'Character scope must match.');
    receiptCheck(CharacterWriteReceipts::inspect($reopened,'missing-id','cal','cal',false)===null && $reopened===$beforeInspect,'Missing lookup never records or changes an action.');
    $before=file_get_contents($file);$failed=false;
    try {AtomicJsonFile::write($file,['invalid'=>chr(255)]);}catch(JsonException $e){$failed=true;}
    receiptCheck($failed && file_get_contents($file)===$before,'Failed encoding preserves the previous complete document.');
    receiptCheck(glob($dir.'/.character-save-*')===[],'No abandoned temporary files.');
    receiptCheck(json_decode(file_get_contents($file),true)['sharon']['surges']===7,'Other character data preserved.');
    echo "Character atomic save and operation receipts passed.\n";
} finally {foreach(glob($dir.'/*') as $entry) unlink($entry);rmdir($dir);}
