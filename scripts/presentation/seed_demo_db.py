#!/usr/bin/env python
"""Seed data demo ke SALINAN database (DB asli tidak disentuh) untuk keperluan screenshot."""
import shutil, sqlite3, os, random
from datetime import date, datetime, timedelta

SRC = "/Users/langkkaukami/x"  # placeholder, overridden below
SRC = "/Users/langkaukami/onezentra-warehouse-system/database/database.sqlite"
DST = "/private/var/folders/3z/sp8y4gs50ln6dm55xc1kf9_00000gn/T/opencode/demo.sqlite"

if os.path.exists(DST):
    os.remove(DST)
shutil.copy(SRC, DST)
db = sqlite3.connect(DST)
db.execute("PRAGMA foreign_keys=OFF")
cur = db.cursor()

TODAY = date(2026, 10, 21)
WK_START, WK_END = date(2026, 10, 19), date(2026, 10, 25)
LAST_WK = date(2026, 10, 12)
KD, ND = "0127", "Singkawang"
NOW = "2026-10-21 09:30:00"


def ts(d, h=8, m=30):
    return f"{d.isoformat()} {h:02d}:{m:02d}:00"


def ins(table, **kw):
    cols = ",".join(f'"{c}"' for c in kw)
    ph = ",".join("?" for _ in kw)
    cur.execute(f'INSERT INTO "{table}" ({cols}) VALUES ({ph})', list(kw.values()))
    return cur.lastrowid


# ── NPN (master produk)
produk = [
    ("MAT-100001", "MINYAK GORENG SEGITIGA 2L", "Minyak Goreng Segitiga Biru 2L", 0.0024, 24, 12, "CPG - Cooking Oil"),
    ("MAT-100002", "SABUN CUCI PIRING 800ML", "Sunlight Lemon 800ml", 0.0009, 12, 6, "CPG - Dishwash"),
    ("MAT-100003", "DETERGEN BUBUK 800G", "Rinso Anti Noda 800g", 0.0011, 20, 8, "CPG - Detergent"),
    ("MAT-100004", "SHAMPOO BOTOL 170ML", "Pantene Daily Moisture 170ml", 0.0004, 12, 4, "CPG - Haircare"),
    ("MAT-100005", "MI INSTAN KARTON", "Indomie Goreng Karton 40 pcs", 0.0120, 120, 40, "CPG - Noodle"),
    ("MAT-100006", "TEH KOTAK 250ML", "Teh Kotak 250ml Dus 24", 0.0068, 60, 24, "CPG - Beverage"),
    ("MAT-100007", "AIR MINUM 600ML", "Air Mineral 600ml Dus 24", 0.0092, 96, 24, "CPG - Water"),
    ("MAT-100008", "KOPI SACHET 165G", "Kopi Kapal Api Special 165g", 0.0005, 15, 6, "CPG - Coffee"),
    ("MAT-100009", "GULA PASIR 1KG", "Gula Pasir Premium 1kg", 0.0013, 25, 10, "Basic Food"),
    ("MAT-100010", "TEPUNG TERIGU 1KG", "Tepung Terigu Cakra 1kg", 0.0012, 22, 10, "Basic Food"),
    ("MAT-100011", "SUSU UHT 1L", "Susu UHT Cokelat 1L Dus 12", 0.0041, 48, 12, "CPG - Dairy"),
    ("MAT-100012", "BISKUIT KELAPA", "Biskuit Kelapa 300g", 0.0007, 18, 8, "CPG - Snack"),
    ("MAT-100013", "PELEMBUT PAKAIAN 800ML", "Molto Safari 800ml", 0.0009, 14, 6, "CPG - Fabric"),
    ("MAT-100014", "PASTA GIGI 190G", "Pepsodent Herbal 190g", 0.0004, 10, 4, "CPG - Oral Care"),
]
npn_ids = []
for i, (kode, nick, desc, vol, uom, wt, cat) in enumerate(produk, 1):
    npn_ids.append(ins("npn", **{
        "BOSnetszProductId": kode, "SAPszProductId": f"SAP-{kode[-4:]}",
        "szNickName": nick, "szNickNameNew": desc, "szShortDescription": desc,
        "szLongDescription": desc, "szCategory_1": cat.split(" - ")[0],
        "szCat1Description": cat.split(" - ")[0],
        "szCategory_2": cat.split(" - ")[1] if " - " in cat else "",
        "szCat2Description": cat.split(" - ")[1] if " - " in cat else "",
        "SAPdecUom": str(uom), "decUomConversion1": uom, "decWeight": wt,
        "decVolume": vol, "szStatus": "ACTIVE", "szBarcode": f"899{1000000 + i}",
        "kode_depo": KD, "nama_depo": ND, "created_by": 15,
        "created_at": ts(date(2026, 9, 28)), "updated_at": NOW,
    }))

# ── Docks
dock_ids = []
for n, st in [("DOCK-01", "OCCUPIED"), ("DOCK-02", "AVAILABLE"), ("DOCK-03", "AVAILABLE"), ("DOCK-04", "AVAILABLE")]:
    dock_ids.append(ins("docks", name=n, code=n, status=st, capacity=2, kode_depo=KD,
                        nama_depo=ND, notes="", created_at=ts(date(2026, 9, 28)), updated_at=NOW))

# ── Rencana Kirim + items
driver = ["Budi Santoso", "Agus Wijaya", "Hendra Gunawan", "Rudi Hartono", "Joko Prasetyo", "Dedi Kurniawan", "Iwan Setiawan", "Fajar Nugroho"]
expedisi = ["Sriwijaya Cargo", "Wahana Global", "Citra Trans", "Borneo Logistik", "Sriwijaya Cargo", "Trans Jaya", "Mandiri Express", "Borneo Logistik"]
nopol = ["BK 8742 TQA", "BK 9031 KDC", "BK 1187 PLM", "BK 6620 BNA", "BK 4415 SRG", "BK 7708 BDJ", "BK 2294 SMP", "BK 5561 PKN"]
statuses = ["DRAFT", "SCHEDULED", "SCHEDULED", "CHECKED_IN", "CHECKED_IN", "VERIFIED", "IN_PROGRESS", "COMPLETED"]
plan_ids = []
for i, st in enumerate(statuses):
    d = TODAY - timedelta(days=len(statuses) - 1 - i)
    items_n = [4, 3, 5, 4, 3, 4, 5, 3][i]
    total = sum([24, 48, 96, 12, 60][j % 5] for j in range(items_n))
    rk = ins("rencana_kirim", **{
        "rkh_date": d.isoformat(), "po_transporter": f"PO-TRP-{d.strftime('%Y%m%d')}-{i + 1:03d}",
        "driver_name": driver[i], "nopol": nopol[i], "expedisi": expedisi[i],
        "jenis_kendaraan": ["CDD", "FUSO", "CDE", "TRONTON", "CDD", "FUSO", "CDD", "CONTAINER 20 FT"][i],
        "shipper_name": "PT OneZentra Distribusi", "shipper_address": "Jl. Raya Cakung Cilincing KM 12, Jakarta Utara",
        "shipper_phone": "0811-8800-1200", "destination_name": "Depo Singkawang",
        "destination_address": "Jl. Pangeran Diponegoro No. 88, Singkawang",
        "kode_depo": KD, "nama_depo": ND, "total_qty": total, "status": st,
        "notes": "Bongkar via DOCK-0%d" % (i % 4 + 1),
        "created_by": 22, "created_at": ts(d, 7, 45), "updated_at": ts(d, 15, 10),
        "scheduled_at": ts(d, 8, 0) if st != "DRAFT" else None,
        "checked_in_at": ts(d, 9, 20) if statuses.index(st) >= 3 and st in ("CHECKED_IN", "VERIFIED", "IN_PROGRESS", "COMPLETED") else None,
        "verified_at": ts(d, 10, 5) if st in ("VERIFIED", "IN_PROGRESS", "COMPLETED") else None,
        "completed_at": ts(d, 11, 40) if st == "COMPLETED" else None,
    })
    plan_ids.append(rk)
    for j in range(items_n):
        p = npn_ids[(i * 2 + j) % len(npn_ids)]
        kode, nick = produk[(i * 2 + j) % len(produk)][0], produk[(i * 2 + j) % len(produk)][1]
        qty = [24, 48, 96, 12, 60][j % 5]
        ins("rencana_kirim_items", rencana_kirim_id=rk, item_number=j + 1, kode_barang=kode,
            nama_barang=nick, jumlah=qty, satuan="PCS" if j % 2 else "CRT", npn_id=p,
            keterangan="", created_at=ts(d, 7, 50), updated_at=ts(d, 7, 50))

# ── Gate transactions (CHECKED_IN ke atas)
for idx in (3, 4, 5, 6, 7):
    d = TODAY - timedelta(days=len(statuses) - 1 - idx)
    ins("gate_transactions", rencana_kirim_id=plan_ids[idx], gate_type="INBOUND", nopol=nopol[idx],
        driver_name=driver[idx], po_transporter=f"PO-TRP-{d.strftime('%Y%m%d')}-{idx + 1:03d}",
        status="CHECKED_IN", scanned_by=23, scan_time=ts(d, 9, 20), notes="Gate in oleh security",
        created_at=ts(d, 9, 20), updated_at=ts(d, 9, 20))

# ── SJ Validation + items + batches (VERIFIED ke atas) & Receiving
batch_no = 1
for idx in (5, 6, 7):
    d = TODAY - timedelta(days=len(statuses) - 1 - idx)
    st = statuses[idx]
    sv = ins("sj_validations", rencana_kirim_id=plan_ids[idx], validated_by=23,
             scan_code=f"PO-TRP-{d.strftime('%Y%m%d')}-{idx + 1:03d}",
             status="COMPLETED" if st != "CHECKED_IN" else "IN_PROGRESS",
             started_at=ts(d, 9, 40), completed_at=ts(d, 10, 35),
             duration_seconds=3300, notes="", created_at=ts(d, 9, 40), updated_at=ts(d, 10, 35))
    rk_items = cur.execute("SELECT id, kode_barang, nama_barang, jumlah, satuan, npn_id FROM rencana_kirim_items WHERE rencana_kirim_id=?", (plan_ids[idx],)).fetchall()
    rcv = ins("receivings", rencana_kirim_id=plan_ids[idx], dock_id=dock_ids[idx % 4],
              status="COMPLETED" if st == "COMPLETED" else ("IN_PROGRESS" if st == "IN_PROGRESS" else "PENDING"),
              total_expected_qty=sum(r[3] for r in rk_items), total_received_qty=sum(r[3] for r in rk_items) - 6,
              dock_status="AVAILABLE" if st == "COMPLETED" else "OCCUPIED", checked_by=23,
              actual_arrival_time=ts(d, 9, 25), actual_start_time=ts(d, 10, 45) if st != "VERIFIED" else None,
              actual_end_time=ts(d, 11, 40) if st == "COMPLETED" else None,
              created_at=ts(d, 10, 40), updated_at=ts(d, 11, 40))
    for k, (rid, kode, nick, qty, sat, pid) in enumerate(rk_items):
        actual = qty if k % 3 else qty - 6
        exp = TODAY + timedelta(days=[180, 45, 12, 95, 30][k % 5])
        svi = ins("sj_validation_items", sj_validation_id=sv, rencana_kirim_item_id=rid, npn_id=pid,
                  barcode=f"LBL-{batch_no:08d}", kode_barang=kode, nama_barang=nick, expected_qty=qty,
                  actual_qty=actual, expired_date=exp.isoformat(), satuan=sat,
                  condition="GOOD", status="COMPLETED", notes="", created_at=ts(d, 10, k * 5), updated_at=ts(d, 10, k * 5))
        ri = ins("receiving_items", receiving_id=rcv, rencana_kirim_item_id=rid, sj_validation_item_id=svi,
                 barcode=f"LBL-{batch_no:08d}", kode_barang=kode, nama_barang=nick, expected_qty=qty,
                 actual_qty=actual, satuan=sat, condition="GOOD", expired_date=exp.isoformat(),
                 selisih_qty=actual - qty, source="VALIDASI_SJ", kode_depo=KD, nama_depo=ND,
                 qty_pcs=actual, conversion_factor=12, tanggal_penerimaan=d.isoformat(),
                 scanned_by=23, scan_time=ts(d, 10, 55), created_at=ts(d, 10, 55), updated_at=ts(d, 10, 55))
        ins("batches", batch_number=f"BATCH-{batch_no:08d}", receiving_id=rcv, sj_validation_item_id=svi,
            receiving_item_id=ri, barcode_label=f"LBL-{batch_no:08d}", status="ACTIVE",
            items_json='[{"qty":%d,"satuan":"%s"}]' % (actual, sat),
            printed_at=ts(d, 10, 40) if k % 2 else None, created_at=ts(d, 10, 35), updated_at=ts(d, 10, 40))
        batch_no += 1

# ── Opname expired waves
waves = [("2027-02-18", 180, "AMAN", "TETAP", 120, 40), ("2026-12-05", 45, "PERHATIAN", "TURUN -14", 84, 28),
         ("2026-11-02", 12, "KRITIS", "NAIK +9", 36, 12), ("2026-10-11", -10, "EXPIRED", "TETAP", 24, 8),
         ("2027-01-09", 80, "AMAN", "BARU", 60, 20), ("2026-11-20", 30, "PERHATIAN", "TETAP", 48, 16),
         ("2026-10-30", 9, "KRITIS", "TURUN -6", 18, 6), ("2027-03-14", 205, "AMAN", "BARU", 144, 48),
         ("2026-12-28", 68, "PERHATIAN", "NAIK +11", 72, 24), ("2026-10-05", -16, "EXPIRED", "NAIK +3", 12, 4)]
for i, (expd, sari, st, per, crt, pcs) in enumerate(waves):
    kode, nick = produk[i % len(produk)][0], produk[i % len(produk)][1]
    ins("opname_expired_waves", week_start=WK_START.isoformat(), week_end=WK_END.isoformat(),
        kode_depo=KD, nama_depo=ND, kode_barang=kode, nama_barang=nick, sumber_material="DARI PENERIMAAN",
        expired_date_ini=expd, expired_date_lalu=expd, selisih_expired_date=0, sisa_hari=sari,
        status_ini=st, status_lalu=st if i % 3 else "AMAN", perubahan=per,
        rekomendasi="Segera kirim/retur" if st in ("KRITIS", "EXPIRED") else ("Prioritaskan keluar" if st == "PERHATIAN" else "FIFO normal"),
        qty_ini_crt=crt, qty_ini_pcs=pcs, qty_lalu_crt=crt + (4 if i % 2 else 0), qty_lalu_pcs=pcs,
        qty_koreksi_crt=0, qty_koreksi_pcs=0, tanggal_penerimaan=(TODAY - timedelta(days=30)).isoformat(),
        batch_numbers=f"BATCH-{i + 1:08d}", source_mix="PENERIMAAN",
        created_at=ts(WK_START, 7, 0), updated_at=ts(WK_START, 7, 0))

sess = ins("opname_expired_sessions", week_start=LAST_WK.isoformat(), week_end=(LAST_WK + timedelta(days=6)).isoformat(),
           kode_depo=KD, nama_depo=ND, assigned_to=23, status="COMPLETED", notes="Opname minggu ke-42",
           started_at=ts(LAST_WK, 8, 0), completed_at=ts(LAST_WK, 15, 30), created_by=15,
           created_at=ts(LAST_WK, 7, 30), updated_at=ts(LAST_WK, 15, 30))
for w in cur.execute("SELECT id FROM opname_expired_waves LIMIT 6").fetchall():
    ins("opname_expired_session_items", session_id=sess, wave_id=w[0], qty_fisik_crt=40, qty_fisik_pcs=120,
        condition="SESUAI", verified_at=ts(LAST_WK, 11, 0), verified_by=23, created_at=ts(LAST_WK, 8, 5), updated_at=ts(LAST_WK, 11, 0))

# ── Biaya THL
thl_status = [("DRAFT", 0), ("SUBMIT", 1), ("CHECKED", 2), ("RLH_APPROVED", 3), ("APPROVED", 4), ("REJECTED", 1)]
for i, (st, lvl) in enumerate(thl_status):
    d = TODAY - timedelta(days=12 - i)
    nominal = [1750000, 2400000, 3150000, 1250000, 4200000, 980000][i]
    bid = ins("biaya_thls", tanggal_pengajuan=d.isoformat(), kode_depo=KD, nama_depo=ND,
              no_kendaraan=nopol[i], type_kendaraan=["CDD", "FUSO", "CDE", "TRONTON", "CDD", "FUSO"][i],
              no_surat_jalan=f"PO-TRP-{d.strftime('%Y%m%d')}-{i + 1:03d}", kubikasi_base=[18.5, 42.0, 9.2, 33.4, 21.0, 55.6][i],
              nominal_biaya=nominal, is_rfah_required=1, rfah_name="User RFAH", approval_pengajuan_level=lvl,
              approval_pengajuan="BLC", created_by=15, status=st, created_at=ts(d, 9, 0), updated_at=ts(d, 16, 0),
              submitted_by=15 if lvl >= 1 else None, submitted_at=ts(d, 9, 30) if lvl >= 1 else None,
              checked_by=19 if lvl >= 2 else None, checked_at=ts(d, 10, 30) if lvl >= 2 else None,
              rlh_approved_by=16 if lvl >= 3 else None, rlh_approved_at=ts(d, 13, 0) if lvl >= 3 else None,
              approved_by=19 if lvl >= 4 else None, approved_at=ts(d, 16, 0) if lvl >= 4 else None,
              rejected_by=19 if st == "REJECTED" else None, rejected_at=ts(d, 16, 0) if st == "REJECTED" else None,
              rejection_reason="Dokumen pendukung belum lengkap" if st == "REJECTED" else None)
    for k in range(2):
        ins("biaya_thl_details", biaya_thl_id=bid, nama_thl=driver[(i + k) % len(driver)],
            driver_name=driver[(i + k) % len(driver)], nopol_kendaraan=nopol[(i + k) % 8],
            type_kendaraan="CDD", kubikasi=[9.2, 9.3, 21.0, 21.0][k % 4],
            droppoint="Depo Singkawang", posisi="Dock 0%d" % (k + 1),
            jam_datang=f"{8 + k}:30", jam_pulang=f"{16 + k}:15",
            nominal_biaya=nominal // 2, order=k + 1, no_surat_jalan=f"PO-TRP-{d.strftime('%Y%m%d')}-{i + 1:03d}",
            created_at=ts(d, 9, 10), updated_at=ts(d, 9, 10))

# ── Biaya Retribusi
for i, st in enumerate(["DRAFT", "CHECKED", "APPROVED", "APPROVED"]):
    d = TODAY - timedelta(days=9 - i)
    rid = ins("biaya_retribusis", tanggal_pengajuan=d.isoformat(), kode_depo=KD, nama_depo=ND,
              nominal_biaya=[640000, 1120000, 880000, 1450000][i], is_rfah_required=0,
              approval_pengajuan="BLC", created_by=15, status=st, created_at=ts(d, 9, 0), updated_at=ts(d, 15, 0),
              submitted_by=15, submitted_at=ts(d, 9, 30))
    ins("biaya_retribusi_details", biaya_retribusi_id=rid, nopol_kendaraan=nopol[i], type_kendaraan="CDD",
        no_surat_jalan=f"PO-TRP-{d.strftime('%Y%m%d')}-{i + 1:03d}", nominal_biaya=[640000, 1120000, 880000, 1450000][i],
        order=1, qty_zak=[12, 20, 16, 24][i], qty_crt=[4, 8, 6, 10][i], created_at=ts(d, 9, 10), updated_at=ts(d, 9, 10))

ins("retribusi_rates", kode_depo=KD, nama_depo=ND, mode="PER_ZAK", rate_zak=4000, rate_crt=12000,
    is_active=1, created_at=ts(date(2026, 9, 28)), updated_at=NOW)
ins("retribusi_rates", kode_depo="0126", nama_depo="Pontianak", mode="PER_KUBIKASI", rate_zak=3500, rate_crt=10000,
    is_active=1, created_at=ts(date(2026, 9, 28)), updated_at=NOW)

# ── Cluster principal, standar umur, standarisasi tumpukan, penerimaan
for i in range(6):
    ins("cluster_principal", lob="FMCG", product_category=["Food", "Beverage", "Household", "Personal Care", "Basic Food", "Snack"][i],
        sub_product_category="General", product_group=f"PG-{i + 101}", product_class=f"PC-{i + 201}",
        product_sku=produk[i][0], principal_1=["Unilever", "Nestlé", "Indofood", "Sinar Mas", "Mayora", "Teh Pucuk"][i],
        principal_2="—", bosnetsz_product_id=produk[i][0], sap_product_id=f"SAP-{i + 1:04d}",
        created_by=1, created_at=ts(date(2026, 9, 28)), updated_at=NOW)
for i in range(5):
    ins("standar_umur_produk", material=produk[i][0], material_description=produk[i][2], principal=["Unilever", "Nestlé", "Indofood", "Sinar Mas", "Mayora"][i],
        cluster="FMCG", lob="FMCG", category="Food", sub_category="General", min_doi=30, target_doi=60, max_doi=90,
        umur=180, vol_m3=produk[i][3], weight_kg=produk[i][5], uom="PCS", sku_status="ACTIVE",
        nickname=produk[i][1], created_at=ts(date(2026, 9, 28)), updated_at=NOW)
for i in range(4):
    ins("standarisasi_tumpukan", npn_id=npn_ids[i], tier=[3, 4, 2, 5][i], tinggi_tumpukan=[160, 180, 140, 200][i],
        total_tier_tinggi=[480, 720, 280, 1000][i], status=["PENDING", "APPROVED", "PENDING", "REJECTED"][i],
        requested_by=23, requested_by_email="cheker.singkawang@onezentra.com",
        approved_by=15 if i % 2 else None, approved_by_email="admin_master.singkawang@onezentra.com" if i % 2 else None,
        kode_depo=KD, nama_depo=ND, created_at=ts(TODAY - timedelta(days=5), 10, 0), updated_at=NOW)
for i in range(8):
    kode, nick = produk[i % len(produk)][0], produk[i % len(produk)][1]
    ins("penerimaan", tanggal_penerimaan=(TODAY - timedelta(days=i)).isoformat(), no_shipment=f"SHP-2026-{i + 1:04d}",
        No_Container="", szBarcode=f"899{1000000 + i + 1}", BOSnetszProductId=kode, SAPszProductId=f"SAP-{i + 1:04d}",
        szNickName=nick, szCompUomDesc="PCS", BOSnetdecUom="24", SAPszUomId="EA", SAPdecUom="24",
        kode_depo=KD, nama_depo=ND, saved_by=15, DO_QTY=[240, 180, 96, 320, 144, 264, 120, 300][i],
        expired_date=(TODAY + timedelta(days=[200, 60, 20, 150, 40, 300, 90, 12][i])).isoformat(),
        sisa=[200, 45, 12, 150, 40, 300, 90, 12][i], szStatus="COMPLETED", status="COMPLETED",
        completed_at=ts(TODAY - timedelta(days=i), 14, 0), created_at=ts(TODAY - timedelta(days=i), 10, 0))

# ── Activity log untuk dashboard
routes = [("POST", "/api/v1/rencana-kirim/1/schedule"), ("POST", "/api/v1/sj-validations/2/scan"),
          ("GET", "/api/v1/rencana-kirim"), ("POST", "/api/v1/gate-transactions"),
          ("POST", "/api/v1/receivings/1/complete"), ("GET", "/api/v1/dashboard/summary"),
          ("POST", "/api/v1/biaya-thl/3/approve"), ("GET", "/api/v1/opname-expired"),
          ("POST", "/api/v1/opname-expired/generate"), ("PUT", "/api/v1/users/15")]
for i, (m, r) in enumerate(routes * 2):
    ins("user_activity_logs", user_id=[15, 23, 22, 19, 16][i % 5], method=m, route=r,
        occurred_at=ts(TODAY - timedelta(days=i % 4), 8 + i % 9, (i * 7) % 60))

db.commit()
counts = {t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in
          ["npn", "docks", "rencana_kirim", "rencana_kirim_items", "gate_transactions", "sj_validations",
           "sj_validation_items", "receivings", "receiving_items", "batches", "opname_expired_waves",
           "opname_expired_sessions", "biaya_thls", "biaya_retribusis", "penerimaan", "user_activity_logs"]}
print(DST)
for k, v in counts.items():
    print(f"  {k}: {v}")
db.close()
