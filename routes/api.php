<?php

use App\Http\Controllers\Api\V1\ApprovalAssignmentController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BatchController;
use App\Http\Controllers\Api\V1\BiayaConfigController;
use App\Http\Controllers\Api\V1\BiayaRetribusiController;
use App\Http\Controllers\Api\V1\BiayaThlController;
use App\Http\Controllers\Api\V1\BiayaThlPdfSettingController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DepoController;
use App\Http\Controllers\Api\V1\DockController;
use App\Http\Controllers\Api\V1\EmailRecipientController;
use App\Http\Controllers\Api\V1\EmailSettingController;
use App\Http\Controllers\Api\V1\GateTransactionController;
use App\Http\Controllers\Api\V1\NpnController;
use App\Http\Controllers\Api\V1\OpnameExpiredController;
use App\Http\Controllers\Api\V1\PenerimaanController;
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
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::prefix('v1')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    // Mobile (Bearer token, per-perangkat). Web SPA tetap cookie-only via /login.
    Route::post('mobile/login', [AuthController::class, 'mobileLogin'])->middleware('throttle:10,1');
    Route::post('mobile/logout', [AuthController::class, 'mobileLogout'])->middleware(['auth:sanctum', 'throttle:10,1']);
    Route::post('register', [AuthController::class, 'register'])
        ->middleware(['auth:sanctum', 'permission:users.create', 'throttle:5,1']);
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

    Route::prefix('approval-assignments')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [ApprovalAssignmentController::class, 'index'])->middleware('permission:approval.view');
        Route::post('/', [ApprovalAssignmentController::class, 'upsert'])->middleware('permission:approval.manage');
    });

    Route::middleware('auth:sanctum')->group(function () {
        // File bukti (foto validasi, dokumen biaya) WAJIB auth: path file
        // dikembalikan polos di respons JSON sehingga route publik = bypass
        // total atas gate permission photos/{photo} & documents/{document}.
        Route::get('storage/{path}', function (string $path) {
            abort_unless(Storage::disk('public')->exists($path), 404);

            return response()->file(Storage::disk('public')->path($path));
        })->where('path', '.*');

        Route::get('user', [AuthController::class, 'user']);
        Route::put('user', [AuthController::class, 'updateProfile']);
    });
    Route::get('depo', [DepoController::class, 'index'])->middleware('auth:sanctum');

    Route::get('dashboard/activity', [DashboardController::class, 'activity'])
        ->middleware(['auth:sanctum', 'permission:dashboard.view']);

    Route::get('dashboard/summary', [DashboardController::class, 'summary'])
        ->middleware(['auth:sanctum', 'permission:dashboard.view']);

    Route::prefix('roles')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/', [RoleController::class, 'store'])->middleware('permission:roles.create');
        Route::get('/{role}', [RoleController::class, 'show'])->middleware('permission:roles.view');
        Route::put('/{role}', [RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete');
        Route::get('/{role}/permissions', [RoleController::class, 'getPermissions'])->middleware('permission:roles.view');
        Route::put('/{role}/permissions', [RoleController::class, 'syncPermissions'])->middleware('permission:roles.edit');
        Route::post('/import', [RoleController::class, 'import'])->middleware('permission:roles.import');
        Route::get('/export', [RoleController::class, 'export'])->middleware('permission:roles.export');
        Route::get('/template', [RoleController::class, 'template'])->middleware('permission:roles.template');
    });

    Route::prefix('permissions')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [PermissionController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/', [PermissionController::class, 'store'])->middleware('permission:roles.create');
        Route::get('/{permission}', [PermissionController::class, 'show'])->middleware('permission:roles.view');
        Route::put('/{permission}', [PermissionController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/{permission}', [PermissionController::class, 'destroy'])->middleware('permission:roles.delete');
    });

    Route::prefix('npn')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [NpnController::class, 'index'])->middleware('permission:npn.view');
        Route::post('/', [NpnController::class, 'store'])->middleware('permission:npn.create');
        Route::get('/export', [NpnController::class, 'export'])->middleware('permission:npn.view');
        Route::get('/template', [NpnController::class, 'template'])->middleware('permission:npn.view');
        Route::get('/search-product', [NpnController::class, 'searchProduct'])->middleware('permission:npn.view');
        Route::get('/{npn}', [NpnController::class, 'show'])->middleware('permission:npn.view');
        Route::put('/{npn}', [NpnController::class, 'update'])->middleware('permission:npn.edit');
        Route::delete('/{npn}', [NpnController::class, 'destroy'])->middleware('permission:npn.delete');
        Route::post('/bulk-delete', [NpnController::class, 'bulkDestroy'])->middleware('permission:npn.delete');
        Route::post('/import', [NpnController::class, 'import'])->middleware('permission:npn.create');
    });

    Route::prefix('penerimaan')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [PenerimaanController::class, 'index'])->middleware('permission:penerimaan.view');
        Route::post('/', [PenerimaanController::class, 'store'])->middleware('permission:penerimaan.create');
        Route::get('/{penerimaan}', [PenerimaanController::class, 'show'])->middleware('permission:penerimaan.view');
        Route::put('/{penerimaan}', [PenerimaanController::class, 'update'])->middleware('permission:penerimaan.edit');
        Route::delete('/{penerimaan}', [PenerimaanController::class, 'destroy'])->middleware('permission:penerimaan.delete');
    });

    Route::prefix('standar-umur-produk')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [StandarUmurProdukController::class, 'index'])->middleware('permission:standar_umur.view');
        Route::post('/', [StandarUmurProdukController::class, 'store'])->middleware('permission:standar_umur.create');
        Route::get('/export', [StandarUmurProdukController::class, 'export'])->middleware('permission:standar_umur.view');
        Route::get('/template', [StandarUmurProdukController::class, 'template'])->middleware('permission:standar_umur.view');
        Route::get('/{standarUmurProduk}', [StandarUmurProdukController::class, 'show'])->middleware('permission:standar_umur.view');
        Route::put('/{standarUmurProduk}', [StandarUmurProdukController::class, 'update'])->middleware('permission:standar_umur.edit');
        Route::delete('/{standarUmurProduk}', [StandarUmurProdukController::class, 'destroy'])->middleware('permission:standar_umur.delete');
        Route::post('/bulk-delete', [StandarUmurProdukController::class, 'bulkDestroy'])->middleware('permission:standar_umur.delete');
        Route::post('/import', [StandarUmurProdukController::class, 'import'])->middleware('permission:standar_umur.create');
    });

    Route::prefix('standarisasi-tumpukan')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [StandarisasiTumpukanController::class, 'index'])->middleware('permission:standarisasi.view');
        Route::post('/', [StandarisasiTumpukanController::class, 'store'])->middleware('permission:standarisasi.create');
        // Wajib didaftarkan sebelum rute ber-parameter {standarisasiTumpukan}
        Route::get('/stats', [StandarisasiTumpukanController::class, 'stats'])->middleware('permission:standarisasi.view');
        Route::get('/search-product', [StandarisasiTumpukanController::class, 'searchProduct'])->middleware('permission:standarisasi.view');
        Route::post('/bulk-delete', [StandarisasiTumpukanController::class, 'bulkDestroy'])->middleware('permission:standarisasi.delete');
        Route::get('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'show'])->middleware('permission:standarisasi.view');
        Route::put('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'update'])->middleware('permission:standarisasi.edit');
        Route::post('/{standarisasiTumpukan}/approve', [StandarisasiTumpukanController::class, 'approve'])->middleware('permission:standarisasi.approve');
        Route::post('/{standarisasiTumpukan}/reject', [StandarisasiTumpukanController::class, 'reject'])->middleware('permission:standarisasi.approve');
        Route::post('/{standarisasiTumpukan}/notify', [StandarisasiTumpukanController::class, 'notify'])->middleware(['permission:standarisasi.view', 'throttle:10,1']);
        Route::delete('/{standarisasiTumpukan}', [StandarisasiTumpukanController::class, 'destroy'])->middleware('permission:standarisasi.delete');
        Route::post('/import', [StandarisasiTumpukanController::class, 'import'])->middleware('permission:standarisasi.import');
        Route::get('/export', [StandarisasiTumpukanController::class, 'export'])->middleware('permission:standarisasi.export');
        Route::get('/template', [StandarisasiTumpukanController::class, 'template'])->middleware('permission:standarisasi.template');
    });

    Route::get('biaya-config', [BiayaConfigController::class, 'show'])->middleware('auth:sanctum');

    Route::prefix('biaya-thl')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [BiayaThlController::class, 'index'])->middleware('permission:biaya_thl.view');
        Route::post('/', [BiayaThlController::class, 'store'])->middleware('permission:biaya_thl.create');
        Route::get('/export', [BiayaThlController::class, 'export'])->middleware('permission:biaya_thl.export');
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
        Route::post('/import', [BiayaThlController::class, 'import'])->middleware('permission:biaya_thl.import');
    });

    Route::prefix('biaya-retribusi')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [BiayaRetribusiController::class, 'index'])->middleware('permission:biaya_retribusi.view');
        Route::get('/candidates', [BiayaRetribusiController::class, 'candidates'])->middleware('permission:biaya_retribusi.view');
        Route::post('/', [BiayaRetribusiController::class, 'store'])->middleware('permission:biaya_retribusi.create');
        Route::get('/export', [BiayaRetribusiController::class, 'export'])->middleware('permission:biaya_retribusi.export');
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
        Route::post('/import', [BiayaRetribusiController::class, 'import'])->middleware('permission:biaya_retribusi.import');
    });

    Route::prefix('retribusi-rates')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [RetribusiRateController::class, 'index'])->middleware('permission:retribusi_rates.manage');
        Route::post('/', [RetribusiRateController::class, 'upsert'])->middleware('permission:retribusi_rates.manage');
        Route::delete('/{kodeDepo}', [RetribusiRateController::class, 'destroy'])->middleware('permission:retribusi_rates.manage');
    });

    Route::prefix('settings/biaya-thl-pdf')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [BiayaThlPdfSettingController::class, 'index'])->middleware('permission:biaya_thl.view');
        Route::post('/', [BiayaThlPdfSettingController::class, 'upsert'])->middleware('permission:biaya_thl.edit');
    });

    Route::prefix('users')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('/', [UserController::class, 'store'])->middleware('permission:users.create');
        Route::get('/{user}', [UserController::class, 'show'])->middleware('permission:users.view');
        Route::put('/{user}', [UserController::class, 'update'])->middleware('permission:users.edit');
        Route::delete('/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
        Route::post('/import', [UserController::class, 'import'])->middleware('permission:users.import|users.create');
    });

    Route::prefix('rencana-kirim')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [RencanaKirimController::class, 'index'])->middleware('permission:rencana_kirim.view');
        Route::post('/', [RencanaKirimController::class, 'store'])->middleware('permission:rencana_kirim.create');
        Route::get('/stats', [RencanaKirimController::class, 'stats'])->middleware('permission:rencana_kirim.view');
        Route::get('/template', [RencanaKirimController::class, 'template'])->middleware('permission:rencana_kirim.view');
        Route::post('/import', [RencanaKirimController::class, 'import'])->middleware('permission:rencana_kirim.import');
        Route::get('/item-template', [RencanaKirimController::class, 'itemTemplate'])->middleware('permission:rencana_kirim.view');
        Route::post('/import-items', [RencanaKirimController::class, 'importItems'])->middleware('permission:rencana_kirim.import');
        Route::get('/{rencanaKirim}', [RencanaKirimController::class, 'show'])->middleware('permission:rencana_kirim.view');
        Route::put('/{rencanaKirim}', [RencanaKirimController::class, 'update'])->middleware('permission:rencana_kirim.edit');
        Route::delete('/{rencanaKirim}', [RencanaKirimController::class, 'destroy'])->middleware('permission:rencana_kirim.delete');
        Route::post('/{rencanaKirim}/schedule', [RencanaKirimController::class, 'schedule'])->middleware('permission:rencana_kirim.edit');
        Route::post('/{rencanaKirim}/verify', [RencanaKirimController::class, 'verify'])->middleware('permission:rencana_kirim.edit');
        Route::post('/{rencanaKirim}/cancel', [RencanaKirimController::class, 'cancel'])->middleware('permission:rencana_kirim.edit');
    });

    Route::prefix('docks')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [DockController::class, 'index'])->middleware('permission:receiving.view');
        Route::post('/', [DockController::class, 'store'])->middleware('permission:receiving.edit');
        Route::get('/{dock}', [DockController::class, 'show'])->middleware('permission:receiving.view');
        Route::put('/{dock}', [DockController::class, 'update'])->middleware('permission:receiving.edit');
        Route::delete('/{dock}', [DockController::class, 'destroy'])->middleware('permission:receiving.edit');
        Route::post('/import', [DockController::class, 'import'])->middleware('permission:receiving.import');
        Route::get('/export', [DockController::class, 'export'])->middleware('permission:receiving.export');
        Route::get('/template', [DockController::class, 'template'])->middleware('permission:receiving.template');
    });

    Route::prefix('gate-transactions')->middleware('auth:sanctum')->group(function () {
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

    Route::prefix('receivings')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [ReceivingController::class, 'index'])->middleware('permission:receiving.view');
        Route::post('/', [ReceivingController::class, 'store'])->middleware('permission:receiving.create');
        Route::get('/{receiving}', [ReceivingController::class, 'show'])->middleware('permission:receiving.view');
        Route::post('/{receiving}/start', [ReceivingController::class, 'startReceiving'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/scan', [ReceivingController::class, 'scanItem'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/complete', [ReceivingController::class, 'completeReceiving'])->middleware('permission:receiving.edit');
        Route::post('/{receiving}/cancel', [ReceivingController::class, 'cancelReceiving'])->middleware('permission:receiving.edit');
        Route::delete('/{receiving}', [ReceivingController::class, 'destroy'])->middleware('permission:receiving.delete');
        Route::post('/import', [ReceivingController::class, 'import'])->middleware('permission:receiving.import');
        Route::get('/export', [ReceivingController::class, 'export'])->middleware('permission:receiving.export');
        Route::get('/template', [ReceivingController::class, 'template'])->middleware('permission:receiving.template');
    });

    Route::prefix('receiving-items')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [ReceivingItemController::class, 'index'])->middleware('permission:penerimaan.view');
        Route::get('/groups', [ReceivingItemController::class, 'groups'])->middleware('permission:penerimaan.view');
        Route::get('/search-product', [ReceivingItemController::class, 'searchProduct'])->middleware('permission:penerimaan.create');
        Route::post('/', [ReceivingItemController::class, 'store'])->middleware('permission:penerimaan.create');
        Route::get('/template', [ReceivingItemController::class, 'template'])->middleware('permission:penerimaan.view');
        Route::post('/import', [ReceivingItemController::class, 'import'])->middleware('permission:penerimaan.create');
        Route::put('/{receivingItem}', [ReceivingItemController::class, 'update'])->middleware('permission:penerimaan.edit');
        Route::delete('/{receivingItem}', [ReceivingItemController::class, 'destroy'])->middleware('permission:penerimaan.delete');
    });

    Route::prefix('opname-expired')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [OpnameExpiredController::class, 'index'])->middleware('permission:opname.view');
        Route::post('/generate', [OpnameExpiredController::class, 'generate'])->middleware('permission:opname.create');
        Route::get('/settings', [OpnameExpiredController::class, 'settings'])->middleware('permission:opname.view');
        Route::put('/settings', [OpnameExpiredController::class, 'updateSettings'])->middleware('permission:opname.edit');
        Route::get('/export', [OpnameExpiredController::class, 'export'])->middleware('permission:opname.view');
        Route::get('/{wave}', [OpnameExpiredController::class, 'show'])->middleware('permission:opname.view');
        Route::put('/{wave}', [OpnameExpiredController::class, 'update'])->middleware('permission:opname.edit');
        Route::delete('/{wave}', [OpnameExpiredController::class, 'destroy'])->middleware('permission:opname.delete');
    });

    Route::prefix('batches')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [BatchController::class, 'index'])->middleware('permission:receiving.view');
        // Rute statis wajib sebelum {batch} — pola yang sama dengan gate-transactions.
        Route::get('/search/by-number', [BatchController::class, 'byNumber'])->middleware('permission:receiving.view');
        Route::get('/{batch}', [BatchController::class, 'show'])->middleware('permission:receiving.view');
    });

    Route::prefix('email-settings')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [EmailSettingController::class, 'show'])->middleware('permission:emails.view');
        Route::put('/', [EmailSettingController::class, 'update'])->middleware('permission:emails.edit');
        Route::post('/test', [EmailSettingController::class, 'test'])->middleware(['permission:emails.edit', 'throttle:3,1']);
    });

    Route::prefix('email-recipients')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [EmailRecipientController::class, 'index'])->middleware('permission:emails.view');
        Route::post('/', [EmailRecipientController::class, 'store'])->middleware('permission:emails.edit');
        Route::put('/{emailRecipient}', [EmailRecipientController::class, 'update'])->middleware('permission:emails.edit');
        Route::delete('/{emailRecipient}', [EmailRecipientController::class, 'destroy'])->middleware('permission:emails.edit');
        Route::get('/options', [EmailRecipientController::class, 'options'])->middleware('permission:emails.view');
    });

    Route::prefix('sj-validations')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [SjValidationController::class, 'index'])->middleware('permission:sj_validation.view');
        Route::get('/lookup', [SjValidationController::class, 'lookup'])->middleware('permission:sj_validation.create');
        Route::get('/stats', [SjValidationController::class, 'stats'])->middleware('permission:sj_validation.view');
        Route::post('/start-by-code', [SjValidationController::class, 'startByCode'])->middleware('permission:sj_validation.create');
        Route::get('/{sjValidation}', [SjValidationController::class, 'show'])->middleware('permission:sj_validation.view');
        Route::post('/start/{rencanaKirim}', [SjValidationController::class, 'start'])->middleware('permission:sj_validation.create');
        Route::post('/{sjValidation}/scan', [SjValidationController::class, 'scanItem'])->middleware('permission:sj_validation.validate');
        Route::delete('/{sjValidation}/items/{item}', [SjValidationController::class, 'deleteItem'])->middleware('permission:sj_validation.delete');
        Route::post('/{sjValidation}/complete', [SjValidationController::class, 'complete'])->middleware('permission:sj_validation.complete');
        Route::post('/{sjValidation}/cancel', [SjValidationController::class, 'cancel'])->middleware('permission:sj_validation.edit');
    });

    Route::prefix('reports')->middleware('auth:sanctum')->group(function () {
        Route::get('/selisih-qty', [ReportController::class, 'selisihQty'])->middleware('permission:reports.view');
        Route::get('/selisih-qty/export', [ReportController::class, 'selisihQtyExport'])->middleware('permission:reports.view');
        Route::get('/penerimaan', [ReportController::class, 'penerimaan'])->middleware('permission:reports.view');
        Route::get('/penerimaan/export', [ReportController::class, 'penerimaanExport'])->middleware('permission:reports.view');
        Route::get('/rencana-kirim', [ReportController::class, 'rencanaKirim'])->middleware('permission:reports.view');
        Route::get('/rencana-kirim/export', [ReportController::class, 'rencanaKirimExport'])->middleware('permission:reports.view');
        Route::get('/biaya-thl', [ReportController::class, 'biayaThl'])->middleware('permission:reports.biaya_thl');
        Route::get('/biaya-thl/export', [ReportController::class, 'biayaThlExport'])->middleware('permission:reports.biaya_thl');
        Route::get('/biaya-retribusi', [ReportController::class, 'biayaRetribusi'])->middleware('permission:reports.biaya_retribusi');
        Route::get('/biaya-retribusi/export', [ReportController::class, 'biayaRetribusiExport'])->middleware('permission:reports.biaya_retribusi');
    });
});
