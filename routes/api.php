<?php

use App\Http\Controllers\Api\V1\AdminDatabaseController;
use App\Http\Controllers\Api\V1\ApprovalAssignmentController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BatchController;
use App\Http\Controllers\Api\V1\BiayaConfigController;
use App\Http\Controllers\Api\V1\BiayaRetribusiController;
use App\Http\Controllers\Api\V1\BiayaThlController;
use App\Http\Controllers\Api\V1\BiayaThlPdfSettingController;
use App\Http\Controllers\Api\V1\ClusterPrincipalController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DepoController;
use App\Http\Controllers\Api\V1\DepotSettingController;
use App\Http\Controllers\Api\V1\DockController;
use App\Http\Controllers\Api\V1\EmailRecipientController;
use App\Http\Controllers\Api\V1\EmailSettingController;
use App\Http\Controllers\Api\V1\GateTransactionController;
use App\Http\Controllers\Api\V1\NpnController;
use App\Http\Controllers\Api\V1\OpnameExpiredController;
use App\Http\Controllers\Api\V1\OpnameExpiredSessionController;
use App\Http\Controllers\Api\V1\PermissionController;
use App\Http\Controllers\Api\V1\ReceivingController;
use App\Http\Controllers\Api\V1\ReceivingItemController;
use App\Http\Controllers\Api\V1\RencanaKirimController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RetribusiRateController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SjValidationController;
use App\Http\Controllers\Api\V1\StandarisasiTumpukanController;
use App\Http\Controllers\Api\V1\StandarUmurProdukController;
use App\Http\Controllers\Api\V1\StorageController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1,login-web');
    // Mobile (Bearer token, per-perangkat). Web SPA tetap cookie-only via /login.
    Route::post('mobile/login', [AuthController::class, 'mobileLogin'])->middleware('throttle:10,1,login-mobile');
    Route::post('mobile/logout', [AuthController::class, 'mobileLogout'])->middleware(['auth:sanctum', 'throttle:30,1,api']);
    Route::post('register', [AuthController::class, 'register'])
        ->middleware(['auth:sanctum', 'permission:users.create', 'throttle:5,1,register']);
    Route::post('logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'throttle:600,1,api']);

    Route::prefix('approval-assignments')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        // GET tanpa gate permission: nama approver depo sendiri dibutuhkan
        // alur preview PDF semua role pengaju (BLC tanpa approval.view).
        // Proteksinya: canAccessDepot (403 lintas depo) + daftar user
        // di-scope ke depo sendiri untuk user ter-scope.
        Route::get('/', [ApprovalAssignmentController::class, 'index']);
        Route::post('/', [ApprovalAssignmentController::class, 'upsert'])->middleware('permission:approval.manage');
    });

    Route::middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        // File bukti (foto validasi, dokumen biaya) WAJIB auth + otorisasi
        // depo pemilik (StorageController): path file dikembalikan polos di
        // respons JSON sehingga route publik = bypass total atas gate file.
        Route::get('storage/{path}', [StorageController::class, 'show'])->where('path', '.*')->middleware('throttle:60,1,files');

        Route::get('user', [AuthController::class, 'user']);
        Route::put('user', [AuthController::class, 'updateProfile']);
    });
    Route::get('depo', [DepoController::class, 'index'])->middleware(['auth:sanctum', 'throttle:600,1,api']);

    // Master alamat depo untuk auto-fill form (asal pengirim dari depo
    // sendiri, alamat tujuan dari depo tujuan). Read: semua user login.
    Route::prefix('depot-settings')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [DepotSettingController::class, 'index']);
        Route::get('/{kodeDepo}', [DepotSettingController::class, 'show']);
        // PUT digate permission (invarian AuthorizationInventoryTest) + gate
        // ulang level admin_master di controller — grant manual ke role lain
        // tetap 403. GET sengaja tanpa gate: dipakai auto-fill form semua role.
        Route::put('/{kodeDepo}', [DepotSettingController::class, 'upsert'])->middleware('permission:depot_settings.manage');
    });

    Route::get('dashboard/activity', [DashboardController::class, 'activity'])
        ->middleware(['auth:sanctum', 'permission:dashboard.view', 'throttle:600,1,api']);

    Route::get('dashboard/summary', [DashboardController::class, 'summary'])
        ->middleware(['auth:sanctum', 'permission:dashboard.view', 'throttle:600,1,api']);

    Route::prefix('roles')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/', [RoleController::class, 'store'])->middleware('permission:roles.create');
        // Rute statis wajib sebelum {role} agar tidak dibayangi binding model.
        Route::post('/import', [RoleController::class, 'import'])->middleware(['permission:roles.import', 'throttle:20,1,heavy-write']);
        Route::get('/export', [RoleController::class, 'export'])->middleware(['permission:roles.export', 'throttle:30,1,heavy-read']);
        Route::get('/template', [RoleController::class, 'template'])->middleware(['permission:roles.template', 'throttle:30,1,heavy-read']);
        Route::get('/{role}', [RoleController::class, 'show'])->middleware('permission:roles.view');
        Route::put('/{role}', [RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete');
        Route::get('/{role}/permissions', [RoleController::class, 'getPermissions'])->middleware('permission:roles.view');
        Route::put('/{role}/permissions', [RoleController::class, 'syncPermissions'])->middleware('permission:roles.edit');
    });

    Route::prefix('permissions')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [PermissionController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/', [PermissionController::class, 'store'])->middleware('permission:roles.create');
        Route::get('/{permission}', [PermissionController::class, 'show'])->middleware('permission:roles.view');
        Route::put('/{permission}', [PermissionController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/{permission}', [PermissionController::class, 'destroy'])->middleware('permission:roles.delete');
    });

    Route::prefix('npn')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [NpnController::class, 'index'])->middleware('permission:npn.view');
        Route::post('/', [NpnController::class, 'store'])->middleware('permission:npn.create');
        Route::get('/export', [NpnController::class, 'export'])->middleware(['permission:npn.view', 'throttle:30,1,heavy-read']);
        Route::get('/template', [NpnController::class, 'template'])->middleware(['permission:npn.view', 'throttle:30,1,heavy-read']);
        Route::get('/search-product', [NpnController::class, 'searchProduct'])->middleware('permission:npn.view');
        Route::get('/{npn}', [NpnController::class, 'show'])->middleware('permission:npn.view');
        Route::put('/{npn}', [NpnController::class, 'update'])->middleware('permission:npn.edit');
        Route::delete('/{npn}', [NpnController::class, 'destroy'])->middleware('permission:npn.delete');
        Route::post('/bulk-delete', [NpnController::class, 'bulkDestroy'])->middleware(['permission:npn.delete', 'throttle:20,1,heavy-write']);
        Route::post('/import', [NpnController::class, 'import'])->middleware(['permission:npn.create', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('cluster-principal')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [ClusterPrincipalController::class, 'index'])->middleware('permission:cluster_principal.view');
        Route::post('/', [ClusterPrincipalController::class, 'store'])->middleware('permission:cluster_principal.create');
        Route::get('/filters', [ClusterPrincipalController::class, 'filters'])->middleware('permission:cluster_principal.view');
        Route::get('/export', [ClusterPrincipalController::class, 'export'])->middleware(['permission:cluster_principal.view', 'throttle:30,1,heavy-read']);
        Route::get('/template', [ClusterPrincipalController::class, 'template'])->middleware(['permission:cluster_principal.view', 'throttle:30,1,heavy-read']);
        Route::get('/{clusterPrincipal}', [ClusterPrincipalController::class, 'show'])->middleware('permission:cluster_principal.view');
        Route::put('/{clusterPrincipal}', [ClusterPrincipalController::class, 'update'])->middleware('permission:cluster_principal.edit');
        Route::delete('/{clusterPrincipal}', [ClusterPrincipalController::class, 'destroy'])->middleware('permission:cluster_principal.delete');
        Route::post('/bulk-delete', [ClusterPrincipalController::class, 'bulkDestroy'])->middleware(['permission:cluster_principal.delete', 'throttle:20,1,heavy-write']);
        Route::post('/import', [ClusterPrincipalController::class, 'import'])->middleware(['permission:cluster_principal.create', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('standar-umur-produk')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [StandarUmurProdukController::class, 'index'])->middleware('permission:standar_umur.view');
        Route::post('/', [StandarUmurProdukController::class, 'store'])->middleware('permission:standar_umur.create');
        Route::get('/export', [StandarUmurProdukController::class, 'export'])->middleware(['permission:standar_umur.view', 'throttle:30,1,heavy-read']);
        Route::get('/template', [StandarUmurProdukController::class, 'template'])->middleware(['permission:standar_umur.view', 'throttle:30,1,heavy-read']);
        Route::get('/{standarUmurProduk}', [StandarUmurProdukController::class, 'show'])->middleware('permission:standar_umur.view');
        Route::put('/{standarUmurProduk}', [StandarUmurProdukController::class, 'update'])->middleware('permission:standar_umur.edit');
        Route::delete('/{standarUmurProduk}', [StandarUmurProdukController::class, 'destroy'])->middleware('permission:standar_umur.delete');
        Route::post('/bulk-delete', [StandarUmurProdukController::class, 'bulkDestroy'])->middleware(['permission:standar_umur.delete', 'throttle:20,1,heavy-write']);
        Route::post('/import', [StandarUmurProdukController::class, 'import'])->middleware(['permission:standar_umur.create', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('standarisasi-tumpukan')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [StandarisasiTumpukanController::class, 'index'])->middleware('permission:standarisasi.view');
        Route::post('/', [StandarisasiTumpukanController::class, 'store'])->middleware('permission:standarisasi.create');
        // Wajib didaftarkan sebelum rute ber-parameter {standarisasiTumpukan}
        Route::get('/stats', [StandarisasiTumpukanController::class, 'stats'])->middleware('permission:standarisasi.view');
        Route::get('/search-product', [StandarisasiTumpukanController::class, 'searchProduct'])->middleware('permission:standarisasi.view');
        Route::post('/bulk-delete', [StandarisasiTumpukanController::class, 'bulkDestroy'])->middleware(['permission:standarisasi.delete', 'throttle:20,1,heavy-write']);
        Route::post('/import', [StandarisasiTumpukanController::class, 'import'])->middleware(['permission:standarisasi.import', 'throttle:20,1,heavy-write']);
        Route::get('/export', [StandarisasiTumpukanController::class, 'export'])->middleware(['permission:standarisasi.export', 'throttle:30,1,heavy-read']);
        Route::get('/template', [StandarisasiTumpukanController::class, 'template'])->middleware(['permission:standarisasi.template', 'throttle:30,1,heavy-read']);
        Route::get('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'show'])->middleware('permission:standarisasi.view');
        Route::put('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'update'])->middleware('permission:standarisasi.edit');
        Route::post('/{standarisasiTumpukan}/approve', [StandarisasiTumpukanController::class, 'approve'])->middleware('permission:standarisasi.approve');
        Route::post('/{standarisasiTumpukan}/reject', [StandarisasiTumpukanController::class, 'reject'])->middleware('permission:standarisasi.approve');
        Route::post('/{standarisasiTumpukan}/notify', [StandarisasiTumpukanController::class, 'notify'])->middleware(['permission:standarisasi.view', 'throttle:20,1,heavy-write']);
        Route::delete('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'destroy'])->middleware('permission:standarisasi.delete');
    });

    Route::get('biaya-config', [BiayaConfigController::class, 'show'])->middleware(['auth:sanctum', 'permission:biaya_thl.view|biaya_retribusi.view', 'throttle:600,1,api']);

    Route::prefix('biaya-thl')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [BiayaThlController::class, 'index'])->middleware('permission:biaya_thl.view');
        Route::get('/candidates', [BiayaThlController::class, 'candidates'])->middleware('permission:biaya_thl.view');
        Route::post('/', [BiayaThlController::class, 'store'])->middleware('permission:biaya_thl.create');
        Route::get('/export', [BiayaThlController::class, 'export'])->middleware(['permission:biaya_thl.export', 'throttle:30,1,heavy-read']);
        Route::get('/photos/{photo}', [BiayaThlController::class, 'photo'])->middleware('permission:biaya_thl.view');
        Route::post('/{biayaThl}/submit', [BiayaThlController::class, 'submit'])->middleware('permission:approval.submit');
        Route::post('/{biayaThl}/check', [BiayaThlController::class, 'check'])->middleware('permission:approval.check');
        Route::post('/{biayaThl}/approve', [BiayaThlController::class, 'approve'])->middleware('permission:approval.approve');
        Route::post('/{biayaThl}/rfah-approve', [BiayaThlController::class, 'rfahApprove'])->middleware('permission:approval.rfah');
        Route::post('/{biayaThl}/reject', [BiayaThlController::class, 'reject'])->middleware('permission:approval.reject');
        Route::post('/{biayaThl}/revise', [BiayaThlController::class, 'revise'])->middleware('permission:approval.revise');
        Route::get('/{biayaThl}/pdf', [BiayaThlController::class, 'pdf'])->middleware('permission:biaya_thl.view');
        Route::get('/{biayaThl}', [BiayaThlController::class, 'show'])->middleware('permission:biaya_thl.view');
        Route::put('/{biayaThl}', [BiayaThlController::class, 'update'])->middleware('permission:biaya_thl.edit');
        Route::delete('/{biayaThl}', [BiayaThlController::class, 'destroy'])->middleware('permission:biaya_thl.delete');
        Route::post('/import', [BiayaThlController::class, 'import'])->middleware(['permission:biaya_thl.import', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('biaya-retribusi')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [BiayaRetribusiController::class, 'index'])->middleware('permission:biaya_retribusi.view');
        Route::get('/candidates', [BiayaRetribusiController::class, 'candidates'])->middleware('permission:biaya_retribusi.view');
        Route::post('/', [BiayaRetribusiController::class, 'store'])->middleware('permission:biaya_retribusi.create');
        Route::get('/export', [BiayaRetribusiController::class, 'export'])->middleware(['permission:biaya_retribusi.export', 'throttle:30,1,heavy-read']);
        Route::get('/documents/{document}', [BiayaRetribusiController::class, 'document'])->middleware('permission:biaya_retribusi.view');
        Route::post('/{biayaRetribusi}/submit', [BiayaRetribusiController::class, 'submit'])->middleware('permission:approval.submit');
        Route::post('/{biayaRetribusi}/check', [BiayaRetribusiController::class, 'check'])->middleware('permission:approval.check');
        Route::post('/{biayaRetribusi}/approve', [BiayaRetribusiController::class, 'approve'])->middleware('permission:approval.approve');
        Route::post('/{biayaRetribusi}/rfah-approve', [BiayaRetribusiController::class, 'rfahApprove'])->middleware('permission:approval.rfah');
        Route::post('/{biayaRetribusi}/reject', [BiayaRetribusiController::class, 'reject'])->middleware('permission:approval.reject');
        Route::post('/{biayaRetribusi}/revise', [BiayaRetribusiController::class, 'revise'])->middleware('permission:approval.revise');
        Route::get('/{biayaRetribusi}/pdf', [BiayaRetribusiController::class, 'pdf'])->middleware('permission:biaya_retribusi.view');
        Route::get('/{biayaRetribusi}', [BiayaRetribusiController::class, 'show'])->middleware('permission:biaya_retribusi.view');
        Route::put('/{biayaRetribusi}', [BiayaRetribusiController::class, 'update'])->middleware('permission:biaya_retribusi.edit');
        Route::delete('/{biayaRetribusi}', [BiayaRetribusiController::class, 'destroy'])->middleware('permission:biaya_retribusi.delete');
        Route::post('/import', [BiayaRetribusiController::class, 'import'])->middleware(['permission:biaya_retribusi.import', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('retribusi-rates')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [RetribusiRateController::class, 'index'])->middleware('permission:retribusi_rates.manage');
        Route::post('/', [RetribusiRateController::class, 'upsert'])->middleware('permission:retribusi_rates.manage');
        Route::delete('/{kodeDepo}', [RetribusiRateController::class, 'destroy'])->middleware('permission:retribusi_rates.manage');
    });

    Route::prefix('settings/biaya-thl-pdf')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [BiayaThlPdfSettingController::class, 'index'])->middleware('permission:biaya_thl.view');
        Route::post('/', [BiayaThlPdfSettingController::class, 'upsert'])->middleware('permission:biaya_thl.edit');
    });

    Route::prefix('users')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('/', [UserController::class, 'store'])->middleware('permission:users.create');
        Route::get('/{user}', [UserController::class, 'show'])->middleware('permission:users.view');
        Route::put('/{user}', [UserController::class, 'update'])->middleware('permission:users.edit');
        Route::delete('/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
        Route::post('/import', [UserController::class, 'import'])->middleware(['permission:users.import|users.create', 'throttle:20,1,heavy-write']);
    });

    Route::prefix('rencana-kirim')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [RencanaKirimController::class, 'index'])->middleware('permission:rencana_kirim.view');
        Route::post('/', [RencanaKirimController::class, 'store'])->middleware('permission:rencana_kirim.create');
        Route::get('/stats', [RencanaKirimController::class, 'stats'])->middleware('permission:rencana_kirim.view');
        Route::get('/template', [RencanaKirimController::class, 'template'])->middleware(['permission:rencana_kirim.view', 'throttle:30,1,heavy-read']);
        Route::post('/import', [RencanaKirimController::class, 'import'])->middleware(['permission:rencana_kirim.import', 'throttle:20,1,heavy-write']);
        Route::get('/item-template', [RencanaKirimController::class, 'itemTemplate'])->middleware(['permission:rencana_kirim.view', 'throttle:30,1,heavy-read']);
        Route::post('/import-items', [RencanaKirimController::class, 'importItems'])->middleware(['permission:rencana_kirim.import', 'throttle:20,1,heavy-write']);
        Route::get('/{rencanaKirim}', [RencanaKirimController::class, 'show'])->middleware('permission:rencana_kirim.view');
        Route::put('/{rencanaKirim}', [RencanaKirimController::class, 'update'])->middleware('permission:rencana_kirim.edit');
        Route::delete('/{rencanaKirim}', [RencanaKirimController::class, 'destroy'])->middleware('permission:rencana_kirim.delete');
        Route::post('/{rencanaKirim}/schedule', [RencanaKirimController::class, 'schedule'])->middleware('permission:rencana_kirim.edit');
        Route::post('/{rencanaKirim}/verify', [RencanaKirimController::class, 'verify'])->middleware('permission:rencana_kirim.edit');
        Route::post('/{rencanaKirim}/cancel', [RencanaKirimController::class, 'cancel'])->middleware('permission:rencana_kirim.edit');
    });

    Route::prefix('docks')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [DockController::class, 'index'])->middleware('permission:receiving.view');
        Route::post('/', [DockController::class, 'store'])->middleware('permission:receiving.edit');
        // Rute statis wajib sebelum {dock} agar tidak dibayangi binding model.
        Route::post('/import', [DockController::class, 'import'])->middleware(['permission:receiving.import', 'throttle:20,1,heavy-write']);
        Route::get('/export', [DockController::class, 'export'])->middleware(['permission:receiving.export', 'throttle:30,1,heavy-read']);
        Route::get('/template', [DockController::class, 'template'])->middleware(['permission:receiving.template', 'throttle:30,1,heavy-read']);
        Route::get('/{dock}', [DockController::class, 'show'])->middleware('permission:receiving.view');
        Route::put('/{dock}', [DockController::class, 'update'])->middleware('permission:receiving.edit');
        Route::delete('/{dock}', [DockController::class, 'destroy'])->middleware('permission:receiving.edit');
    });

    Route::prefix('gate-transactions')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/stats', [GateTransactionController::class, 'stats'])->middleware('permission:gate.view');
        // Rute statis wajib sebelum rute ber-parameter {gateTransaction}
        // agar tidak tertelan model binding (lookup PO selalu 404).
        Route::get('/search/by-dokumen', [GateTransactionController::class, 'byNoDokumen'])->middleware('permission:gate.view');
        Route::get('/', [GateTransactionController::class, 'index'])->middleware('permission:gate.view');
        Route::post('/', [GateTransactionController::class, 'store'])->middleware('permission:gate.create');
        Route::get('/{gateTransaction}', [GateTransactionController::class, 'show'])->middleware('permission:gate.view');
        Route::put('/{gateTransaction}', [GateTransactionController::class, 'update'])->middleware('permission:gate.edit');
        Route::delete('/{gateTransaction}', [GateTransactionController::class, 'destroy'])->middleware('permission:gate.delete');
    });

    Route::prefix('receivings')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [ReceivingController::class, 'index'])->middleware('permission:receiving.view');
        Route::post('/', [ReceivingController::class, 'store'])->middleware('permission:receiving.create');
        // Rute statis wajib sebelum {receiving} agar tidak dibayangi binding model.
        Route::post('/import', [ReceivingController::class, 'import'])->middleware(['permission:receiving.import', 'throttle:20,1,heavy-write']);
        Route::get('/export', [ReceivingController::class, 'export'])->middleware(['permission:receiving.export', 'throttle:30,1,heavy-read']);
        Route::get('/template', [ReceivingController::class, 'template'])->middleware(['permission:receiving.template', 'throttle:30,1,heavy-read']);
        Route::get('/{receiving}', [ReceivingController::class, 'show'])->middleware('permission:receiving.view');
        Route::post('/{receiving}/start', [ReceivingController::class, 'startReceiving'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/scan', [ReceivingController::class, 'scanItem'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/complete', [ReceivingController::class, 'completeReceiving'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/cancel', [ReceivingController::class, 'cancelReceiving'])->middleware('permission:receiving.edit');
        Route::delete('/{receiving}', [ReceivingController::class, 'destroy'])->middleware('permission:receiving.delete');
    });

    Route::prefix('receiving-items')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [ReceivingItemController::class, 'index'])->middleware('permission:penerimaan.view');
        Route::get('/groups', [ReceivingItemController::class, 'groups'])->middleware('permission:penerimaan.view');
        Route::get('/search-product', [ReceivingItemController::class, 'searchProduct'])->middleware('permission:penerimaan.create');
        Route::post('/', [ReceivingItemController::class, 'store'])->middleware('permission:penerimaan.create');
        Route::get('/template', [ReceivingItemController::class, 'template'])->middleware(['permission:penerimaan.view', 'throttle:30,1,heavy-read']);
        Route::post('/import', [ReceivingItemController::class, 'import'])->middleware(['permission:penerimaan.create', 'throttle:20,1,heavy-write']);
        // Rute statis wajib sebelum {receivingItem}.
        Route::delete('/bulk', [ReceivingItemController::class, 'bulkDestroy'])->middleware(['permission:penerimaan.delete', 'throttle:20,1,heavy-write']);
        Route::put('/{receivingItem}', [ReceivingItemController::class, 'update'])->middleware('permission:penerimaan.edit');
        Route::delete('/{receivingItem}', [ReceivingItemController::class, 'destroy'])->middleware('permission:penerimaan.delete');
    });

    Route::prefix('opname-expired')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [OpnameExpiredController::class, 'index'])->middleware('permission:opname.view');
        Route::post('/generate', [OpnameExpiredController::class, 'generate'])->middleware('permission:opname.create');
        // Rute statis wajib sebelum {wave} — pola yang sama dengan batches/search.
        Route::get('/pending', [OpnameExpiredController::class, 'pending'])->middleware('permission:opname.view');
        Route::get('/progress', [OpnameExpiredController::class, 'progress'])->middleware('permission:opname.view');
        Route::post('/remind', [OpnameExpiredController::class, 'remind'])->middleware('permission:opname.create');
        Route::get('/settings', [OpnameExpiredController::class, 'settings'])->middleware('permission:opname.view');
        Route::put('/settings', [OpnameExpiredController::class, 'updateSettings'])->middleware('permission:opname.edit');
        Route::get('/export', [OpnameExpiredController::class, 'export'])->middleware(['permission:opname.view', 'throttle:30,1,heavy-read']);
        Route::get('/{wave}', [OpnameExpiredController::class, 'show'])->middleware('permission:opname.view');
        Route::put('/{wave}', [OpnameExpiredController::class, 'update'])->middleware('permission:opname.edit');
        Route::delete('/{wave}', [OpnameExpiredController::class, 'destroy'])->middleware('permission:opname.delete');
    });

    // Sesi opname lapangan (aturan A2): label batch diterbitkan saat
    // verifikasi fisik. POST dipakai untuk verify agar upload foto bisa
    // multipart (PUT + FormData tidak andal di semua client).
    Route::prefix('opname-sessions')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [OpnameExpiredSessionController::class, 'index'])->middleware('permission:opname.session.view');
        // Didaftarkan sebelum /{session} agar tidak tertangkap route model binding.
        Route::get('/officers', [OpnameExpiredSessionController::class, 'officers'])->middleware('permission:opname.session.create');
        Route::post('/', [OpnameExpiredSessionController::class, 'store'])->middleware('permission:opname.session.create');
        Route::get('/{session}', [OpnameExpiredSessionController::class, 'show'])->middleware('permission:opname.session.view');
        Route::post('/{session}/start', [OpnameExpiredSessionController::class, 'start'])->middleware('permission:opname.session.edit');
        Route::post('/{session}/waves', [OpnameExpiredSessionController::class, 'addWaves'])->middleware('permission:opname.session.create');
        Route::post('/{session}/items/{item}', [OpnameExpiredSessionController::class, 'verifyItem'])->middleware('permission:opname.session.edit');
        Route::post('/{session}/complete', [OpnameExpiredSessionController::class, 'complete'])->middleware('permission:opname.session.edit');
        Route::post('/{session}/cancel', [OpnameExpiredSessionController::class, 'cancel'])->middleware('permission:opname.session.edit');
    });

    Route::prefix('batches')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [BatchController::class, 'index'])->middleware('permission:receiving.view');
        // Rute statis wajib sebelum {batch} — pola yang sama dengan gate-transactions.
        Route::get('/search/by-number', [BatchController::class, 'byNumber'])->middleware('permission:receiving.view');
        // Tanda cetak label: cheker di validasi-sj maupun operator Inbound —
        // keduanya punya izin ini (cheker: sj_validation.validate; Inbound: penerimaan.view).
        Route::post('/{batch}/mark-printed', [BatchController::class, 'markPrinted'])
            ->middleware('permission:sj_validation.validate|penerimaan.view');
        Route::get('/{batch}', [BatchController::class, 'show'])->middleware('permission:receiving.view');
    });

    Route::prefix('email-settings')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [EmailSettingController::class, 'show'])->middleware('permission:emails.view');
        Route::put('/', [EmailSettingController::class, 'update'])->middleware('permission:emails.edit');
        Route::post('/test', [EmailSettingController::class, 'test'])->middleware(['permission:emails.edit', 'throttle:3,1,email-test']);
        Route::get('/notification-logs', [EmailSettingController::class, 'notificationLogs'])->middleware('permission:emails.view');
    });

    Route::prefix('email-recipients')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [EmailRecipientController::class, 'index'])->middleware('permission:emails.view');
        Route::post('/', [EmailRecipientController::class, 'store'])->middleware('permission:emails.edit');
        // Rute statis wajib sebelum {emailRecipient} agar tidak dibayangi binding model.
        Route::post('/bulk', [EmailRecipientController::class, 'storeBulk'])->middleware('permission:emails.edit');
        Route::get('/options', [EmailRecipientController::class, 'options'])->middleware('permission:emails.view');
        Route::put('/depot-settings/{kodeDepo}', [EmailRecipientController::class, 'updateDepotSetting'])->middleware('permission:emails.edit');
        Route::put('/{emailRecipient}', [EmailRecipientController::class, 'update'])->middleware('permission:emails.edit');
        Route::delete('/{emailRecipient}', [EmailRecipientController::class, 'destroy'])->middleware('permission:emails.edit');
    });

    // Reset data operasional per modul — KHUSUS admin_master. Middleware
    // permission menyaring di tepi; controller meng-gate ulang level agar
    // grant manual slug ini ke role lain lewat UI tetap tidak bisa purge.
    Route::prefix('admin/database')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/summary', [AdminDatabaseController::class, 'summary'])->middleware('permission:database.purge');
        Route::get('/documents', [AdminDatabaseController::class, 'documents'])->middleware('permission:database.purge');
        Route::post('/purge', [AdminDatabaseController::class, 'purge'])->middleware(['permission:database.purge', 'throttle:10,1,heavy-write']);
        Route::post('/purge-items', [AdminDatabaseController::class, 'purgeItems'])->middleware(['permission:database.purge', 'throttle:10,1,heavy-write']);
        Route::post('/backfill-depot', [AdminDatabaseController::class, 'backfillDepot'])->middleware(['permission:database.purge', 'throttle:10,1,heavy-write']);
    });

    Route::prefix('sj-validations')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/', [SjValidationController::class, 'index'])->middleware('permission:sj_validation.view');
        Route::get('/lookup', [SjValidationController::class, 'lookup'])->middleware('permission:sj_validation.create');
        Route::get('/stats', [SjValidationController::class, 'stats'])->middleware('permission:sj_validation.view');
        Route::post('/start-by-code', [SjValidationController::class, 'startByCode'])->middleware('permission:sj_validation.create');
        Route::get('/{sjValidation}', [SjValidationController::class, 'show'])->middleware('permission:sj_validation.view');
        Route::post('/start/{rencanaKirim}', [SjValidationController::class, 'start'])->middleware('permission:sj_validation.create');
        Route::post('/{sjValidation}/scan', [SjValidationController::class, 'scanItem'])->middleware('permission:sj_validation.validate');
        Route::delete('/{sjValidation}/items/{item}', [SjValidationController::class, 'deleteItem'])->middleware('permission:sj_validation.delete');
        Route::post('/{sjValidation}/complete', [SjValidationController::class, 'complete'])->middleware('permission:sj_validation.complete');
        // Gate memakai permission `cancel` (bukan `edit`): membatalkan validasi adalah
        // aksi berisiko tersendiri, tidak sama dengan mengoreksi item.
        // Kalau dipaksa memakai `edit`, role yang boleh memperbaiki data tapi
        // tidak boleh membatalkan dokumen ikut bisa cancel — atau sebaliknya.
        Route::post('/{sjValidation}/cancel', [SjValidationController::class, 'cancel'])->middleware('permission:sj_validation.cancel');
    });

    Route::prefix('reports')->middleware(['auth:sanctum', 'throttle:600,1,api'])->group(function () {
        Route::get('/selisih-qty', [ReportController::class, 'selisihQty'])->middleware('permission:reports.view');
        Route::get('/selisih-qty/export', [ReportController::class, 'selisihQtyExport'])->middleware(['permission:reports.view', 'throttle:30,1,heavy-read']);
        Route::get('/penerimaan', [ReportController::class, 'penerimaan'])->middleware('permission:reports.view');
        Route::get('/penerimaan/export', [ReportController::class, 'penerimaanExport'])->middleware(['permission:reports.view', 'throttle:30,1,heavy-read']);
        Route::get('/penerimaan-batch-expired', [ReportController::class, 'penerimaanExpired'])->middleware('permission:reports.view');
        Route::get('/penerimaan-batch-expired/export', [ReportController::class, 'penerimaanExpiredExport'])->middleware(['permission:reports.view', 'throttle:30,1,heavy-read']);
        Route::get('/rencana-kirim', [ReportController::class, 'rencanaKirim'])->middleware('permission:reports.view');
        Route::get('/rencana-kirim/export', [ReportController::class, 'rencanaKirimExport'])->middleware(['permission:reports.view', 'throttle:30,1,heavy-read']);
        Route::get('/biaya-thl', [ReportController::class, 'biayaThl'])->middleware('permission:reports.biaya_thl');
        Route::get('/biaya-thl/export', [ReportController::class, 'biayaThlExport'])->middleware(['permission:reports.biaya_thl', 'throttle:30,1,heavy-read']);
        Route::get('/biaya-retribusi', [ReportController::class, 'biayaRetribusi'])->middleware('permission:reports.biaya_retribusi');
        Route::get('/biaya-retribusi/export', [ReportController::class, 'biayaRetribusiExport'])->middleware(['permission:reports.biaya_retribusi', 'throttle:30,1,heavy-read']);
    });
});
