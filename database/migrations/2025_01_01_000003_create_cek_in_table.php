<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cek_in', function (Blueprint $table) {
            $table->increments('id');
            $table->date('tanggal_cek_in')->nullable();
            $table->string('no_shipment', 50)->nullable();
            $table->string('No_Container', 50)->nullable();
            $table->string('szBarcode', 20)->nullable();
            $table->string('szBarcodeSekunder', 20)->nullable();
            $table->string('szBarcodeTersier', 20)->nullable();
            $table->string('BOSnetszProductId', 20)->nullable();
            $table->string('SAPszProductId', 20)->nullable();
            $table->string('szNickName', 50)->nullable();
            $table->string('szCompUomDesc', 50)->nullable();
            $table->string('BOSnetdecUom', 50)->nullable();
            $table->string('SAPszUomId', 50)->nullable();
            $table->string('SAPdecUom', 50)->nullable();
            $table->string('kode_depo', 20)->nullable()->index();
            $table->string('nama_depo', 100)->nullable();
            $table->unsignedBigInteger('saved_by')->nullable();
            $table->decimal('DO_QTY', 10, 2)->nullable();
            $table->date('expired_date')->nullable();
            $table->string('sisa', 50)->nullable();
            $table->string('szStatus', 20)->nullable();
            $table->dateTime('created_at')->useCurrent();
            $table->string('status', 20)->default('draft')->index();
            $table->timestamp('completed_at')->nullable();
            $table->string('request_id', 80)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cek_in');
    }
};
