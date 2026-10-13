<?php

use App\Models\EmailRecipient;

require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make("Illuminate\Contracts\Console\Kernel")->bootstrap();

$biayaThlTriggers = [
    ['submitted', 'TO', 'blc', 'BLC notifikasi pengajuan THL'],
    ['submitted', 'CC', 'cheker', 'CC cheker pengajuan THL'],
    ['checked', 'TO', 'blc', 'BLC notifikasi THL diperiksa'],
    ['checked', 'CC', 'cheker', 'CC cheker THL diperiksa'],
    ['rlh_approved', 'TO', 'blc', 'BLC notifikasi THL disetujui RLH'],
    ['rlh_approved', 'CC', 'rlh', 'CC RLH notifikasi THL disetujui'],
    ['approved', 'TO', 'blc', 'BLC notifikasi THL disetujui'],
    ['approved', 'CC', 'rfah', 'CC RFAH notifikasi THL disetujui'],
    ['rejected', 'TO', 'blc', 'BLC notifikasi THL ditolak'],
    ['rejected', 'CC', 'rfah', 'CC RFAH notifikasi THL ditolak'],
    ['revisi', 'TO', 'blc', 'BLC notifikasi THL revisi'],
    ['revisi', 'CC', 'rfah', 'CC RFAH notifikasi THL revisi'],
];

$biayaRetribusiTriggers = [
    ['submitted', 'TO', 'blc', 'BLC notifikasi pengajuan Retribusi'],
    ['submitted', 'CC', 'cheker', 'CC cheker pengajuan Retribusi'],
    ['checked', 'TO', 'blc', 'BLC notifikasi Retribusi diperiksa'],
    ['checked', 'CC', 'cheker', 'CC cheker Retribusi diperiksa'],
    ['rlh_approved', 'TO', 'blc', 'BLC notifikasi Retribusi disetujui RLH'],
    ['rlh_approved', 'CC', 'rlh', 'CC RLH notifikasi Retribusi disetujui'],
    ['approved', 'TO', 'blc', 'BLC notifikasi Retribusi disetujui'],
    ['approved', 'CC', 'rfah', 'CC RFAH notifikasi Retribusi disetujui'],
    ['rejected', 'TO', 'blc', 'BLC notifikasi Retribusi ditolak'],
    ['rejected', 'CC', 'rfah', 'CC RFAH notifikasi Retribusi ditolak'],
    ['revisi', 'TO', 'blc', 'BLC notifikasi Retribusi revisi'],
    ['revisi', 'CC', 'rfah', 'CC RFAH notifikasi Retribusi revisi'],
];

foreach ($biayaThlTriggers as $t) {
    $result = EmailRecipient::updateOrCreate(
        ['document_type' => 'biaya_thl', 'trigger' => $t[0], 'field' => $t[1], 'recipient_type' => 'role', 'role_slug' => $t[2]],
        ['label' => $t[3], 'is_active' => true]
    );
    echo 'THL: '.$result->trigger.' | '.$result->field.' | '.$result->role_slug.' (ID: '.$result->id.")\n";
}

foreach ($biayaRetribusiTriggers as $t) {
    $result = EmailRecipient::updateOrCreate(
        ['document_type' => 'biaya_retribusi', 'trigger' => $t[0], 'field' => $t[1], 'recipient_type' => 'role', 'role_slug' => $t[2]],
        ['label' => $t[3], 'is_active' => true]
    );
    echo 'RET: '.$result->trigger.' | '.$result->field.' | '.$result->role_slug.' (ID: '.$result->id.")\n";
}
