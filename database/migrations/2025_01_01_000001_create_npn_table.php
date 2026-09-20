<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('npn', function (Blueprint $table) {
            $table->id();
            $table->string('kode_depo', 255)->index();
            $table->string('nama_depo', 255)->index();
            $table->unsignedBigInteger('validated_by')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('BOSnetszProductId', 20)->nullable()->index();
            $table->string('SAPszProductId', 20)->nullable()->index();
            $table->string('szNickName', 50)->nullable()->index();
            $table->string('szNickNameNew', 255)->nullable();
            $table->text('szShortDescription')->nullable();
            $table->text('szLongDescription')->nullable();
            $table->string('szCategory_1', 20)->nullable();
            $table->string('szCat1Description', 100)->nullable()->index();
            $table->string('szCategory_2', 20)->nullable();
            $table->string('szCat2Description', 100)->nullable()->index();
            $table->string('szCategory_3', 20)->nullable();
            $table->string('szCat3Description', 100)->nullable();
            $table->string('szCategory_4', 20)->nullable();
            $table->string('szCat4Description', 100)->nullable();
            $table->string('szCategory_5', 20)->nullable();
            $table->string('szCat5Description', 100)->nullable();
            $table->string('szCategory_6', 20)->nullable();
            $table->string('szCat6Description', 100)->nullable();
            $table->string('szCategory_7', 20)->nullable();
            $table->string('szCat7Description', 100)->nullable();
            $table->string('szCategory_8', 20)->nullable();
            $table->string('szCat8Description', 100)->nullable()->index();
            $table->string('szCategory_9', 20)->nullable();
            $table->string('szCat9Description', 100)->nullable();
            $table->string('szCategory_10', 20)->nullable();
            $table->string('szCat10Description', 100)->nullable();
            $table->string('szCompUomId', 20)->nullable();
            $table->string('szCompUomDesc', 50)->nullable();
            $table->string('BOSnetszUomId', 20)->nullable();
            $table->string('BOSnetdecUom', 50)->nullable();
            $table->string('SAPszUomId', 20)->nullable();
            $table->string('SAPdecUom', 50)->nullable();
            $table->decimal('decUomConversion1', 10, 2)->nullable();
            $table->decimal('decUomConversion2', 10, 2)->nullable();
            $table->decimal('decWeight', 10, 2)->nullable();
            $table->decimal('decLength', 10, 2)->nullable();
            $table->decimal('decWidth', 10, 2)->nullable();
            $table->decimal('decHeight', 10, 2)->nullable();
            $table->decimal('decVolume', 10, 2)->nullable();
            $table->string('decStoreTemp', 20)->nullable();
            $table->string('szBarcode', 20)->nullable()->index();
            $table->string('szBarcodeSekunder', 20)->nullable();
            $table->string('szBarcodeTersier', 20)->nullable();
            $table->string('szStatus', 10)->nullable();
            $table->dateTime('dtmValidEnd')->nullable();
            $table->string('SAPszSalesOrgId', 10)->nullable();
            $table->string('szTaxTypeId', 10)->nullable();
            $table->decimal('decRate', 10, 2)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('npn');
    }
};
