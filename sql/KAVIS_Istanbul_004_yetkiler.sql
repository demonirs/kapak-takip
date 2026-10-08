-- KAVIS Istanbul 004: Yalnızca İstanbul projesine uygulanır.
-- Tek transaction: herhangi bir hata bütün değişiklikleri geri alır.
begin;

-- Ankara ortamında çalıştırmayı önlemek için bu projeyi elle doğrulayın.
do $$ begin
  if to_regclass('public.ana_depo_urunleri') is null then
    raise exception 'Ana Depo altyapısı bulunamadı. İstanbul projesini kontrol edin.';
  end if;
end $$;

create or replace function public.kavis_warehouse_read_allowed()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id=auth.uid()
  and role in ('admin','depo','depo_viewer')); $$;

create or replace function public.kavis_case_write_allowed()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id=auth.uid()
  and role in ('admin','member','depo_viewer')); $$;

revoke all on function public.kavis_warehouse_read_allowed() from public, anon;
revoke all on function public.kavis_case_write_allowed() from public, anon;
grant execute on function public.kavis_warehouse_read_allowed() to authenticated, service_role;
grant execute on function public.kavis_case_write_allowed() to authenticated, service_role;

alter table public.profiles drop constraint if exists kavis_profiles_role_check;
alter table public.profiles add constraint kavis_profiles_role_check
  check (role is not null and role in ('member','depo','depo_viewer','admin'));

drop policy if exists kavis_warehouse_read_guard on public.ana_depo_urunleri;
create policy kavis_warehouse_read_guard on public.ana_depo_urunleri
as restrictive for select to public using (public.kavis_warehouse_read_allowed());
drop policy if exists kavis_warehouse_read_guard on public.ana_depo_hareketleri;
create policy kavis_warehouse_read_guard on public.ana_depo_hareketleri
as restrictive for select to public using (public.kavis_warehouse_read_allowed());
drop policy if exists kavis_warehouse_read_guard on public.ana_depo_urun_katalogu;
create policy kavis_warehouse_read_guard on public.ana_depo_urun_katalogu
as restrictive for select to public using (public.kavis_warehouse_read_allowed());
revoke insert, update, delete on public.ana_depo_urunleri from public, anon, authenticated;
revoke insert, update, delete on public.ana_depo_hareketleri from public, anon, authenticated;
drop policy if exists kavis_case_insert_guard on public.kapaklar;
create policy kavis_case_insert_guard on public.kapaklar as restrictive for insert to authenticated with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_update_guard on public.kapaklar;
create policy kavis_case_update_guard on public.kapaklar as restrictive for update to authenticated using (public.kavis_case_write_allowed()) with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_delete_guard on public.kapaklar;
create policy kavis_case_delete_guard on public.kapaklar as restrictive for delete to authenticated using (public.kavis_case_write_allowed()) ;
drop policy if exists kavis_case_insert_guard on public.foc_kayitlari;
create policy kavis_case_insert_guard on public.foc_kayitlari as restrictive for insert to authenticated with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_update_guard on public.foc_kayitlari;
create policy kavis_case_update_guard on public.foc_kayitlari as restrictive for update to authenticated using (public.kavis_case_write_allowed()) with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_delete_guard on public.foc_kayitlari;
create policy kavis_case_delete_guard on public.foc_kayitlari as restrictive for delete to authenticated using (public.kavis_case_write_allowed()) ;
drop policy if exists kavis_case_insert_guard on public.rakip_vakalar;
create policy kavis_case_insert_guard on public.rakip_vakalar as restrictive for insert to authenticated with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_update_guard on public.rakip_vakalar;
create policy kavis_case_update_guard on public.rakip_vakalar as restrictive for update to authenticated using (public.kavis_case_write_allowed()) with check (public.kavis_case_write_allowed());
drop policy if exists kavis_case_delete_guard on public.rakip_vakalar;
create policy kavis_case_delete_guard on public.rakip_vakalar as restrictive for delete to authenticated using (public.kavis_case_write_allowed()) ;

CREATE OR REPLACE FUNCTION public.create_case_atomically(p_vaka_tarihi date, p_merkez_hastane text, p_doktor text, p_hasta_adi text, p_kapak_tipi text, p_kapak_size text, p_lot_no text, p_son_kul_tarihi date, p_pre_balon text, p_post_balon text, p_paravalvuler_ay text, p_proglide_adedi integer, p_crimp_yapan text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_user_id uuid := auth.uid();
  normalized_lot text;
  valve_size integer;
  matching_stock_count integer;
  matching_stock public.kapak_stok%rowtype;
  new_case_id uuid;
begin
  if not public.kavis_case_write_allowed() then
    raise exception 'Bu işlem için klinik vaka yetkisi gerekli.' using errcode = '42501';
  end if;

  if current_user_id is null then
    raise exception 'Oturum bulunamadı.'
      using errcode = '42501';
  end if;

  if p_vaka_tarihi is null then
    raise exception 'Vaka tarihi gerekli.';
  end if;

  if nullif(btrim(coalesce(p_merkez_hastane, '')), '') is null then
    raise exception 'Merkez / hastane gerekli.';
  end if;

  if nullif(btrim(coalesce(p_doktor, '')), '') is null then
    raise exception 'Doktor gerekli.';
  end if;

  if nullif(btrim(coalesce(p_hasta_adi, '')), '') is null then
    raise exception 'Hasta adı gerekli.';
  end if;

  if nullif(btrim(coalesce(p_kapak_tipi, '')), '') is null then
    raise exception 'Kapak tipi gerekli.';
  end if;

  if nullif(btrim(coalesce(p_kapak_size, '')), '') is null then
    raise exception 'Kapak ölçüsü gerekli.';
  end if;

  if nullif(btrim(coalesce(p_lot_no, '')), '') is null then
    raise exception 'LOT/SN gerekli.';
  end if;

  if p_son_kul_tarihi is null then
    raise exception 'Son kullanma tarihi gerekli.';
  end if;

  if nullif(btrim(coalesce(p_crimp_yapan, '')), '') is null then
    raise exception 'Crimp yapan kullanıcı gerekli.';
  end if;

  if p_proglide_adedi is null
    or p_proglide_adedi < 1
    or p_proglide_adedi > 4 then
    raise exception 'ProGlide adedi 1 ile 4 arasında olmalıdır.';
  end if;

  normalized_lot := regexp_replace(
    regexp_replace(
      upper(btrim(p_lot_no)),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  );

  valve_size := nullif(
    substring(
      coalesce(p_kapak_size, '')
      from '[0-9]+'
    ),
    ''
  )::integer;

  if valve_size is null then
    raise exception 'Kapak ölçüsü okunamadı.';
  end if;

  select count(*)
  into matching_stock_count
  from public.kapak_stok as stock_record
  where regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(stock_record.lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  ) = normalized_lot
    and stock_record.kapak_boyutu = valve_size;

  if matching_stock_count > 1 then
    raise exception
      'Aynı LOT/SN (%) ve ölçü (% mm) ile birden fazla stok kaydı bulundu. Vaka kaydı durduruldu.',
      normalized_lot,
      valve_size;
  end if;

  if matching_stock_count = 1 then
    select stock_record.*
    into strict matching_stock
    from public.kapak_stok as stock_record
    where regexp_replace(
      regexp_replace(
        upper(btrim(coalesce(stock_record.lot_no, ''))),
        '[[:space:]]+',
        '',
        'g'
      ),
      '(\(20\)01|2001)$',
      '',
      'i'
    ) = normalized_lot
      and stock_record.kapak_boyutu = valve_size
    for update;

    if matching_stock.durum = 'transfer_edildi' then
      raise exception
        'Bu LOT/SN (%) başka bir ile transfer edilmiş. Vaka kaydı kabul edilmedi.',
        normalized_lot;
    end if;

    if matching_stock.durum = 'kullanildi' then
      raise exception
        'Bu LOT/SN (%) daha önce kullanılmış. Aynı kapak ikinci kez kaydedilemez.',
        normalized_lot
        using errcode = '23505';
    end if;

    if matching_stock.durum <> 'stokta' then
      raise exception
        'Bu LOT/SN (%) uygun stok durumunda değil. Vaka kaydı durduruldu.',
        normalized_lot;
    end if;
  end if;

  insert into public.kapaklar (
    user_id,
    vaka_tarihi,
    merkez_hastane,
    doktor,
    hasta_adi,
    kapak_tipi,
    kapak_size,
    lot_no,
    son_kul_tarihi,
    pre_balon,
    post_balon,
    paravalvuler_ay,
    proglide_adedi,
    crimp_yapan
  )
  values (
    current_user_id,
    p_vaka_tarihi,
    btrim(p_merkez_hastane),
    btrim(p_doktor),
    btrim(p_hasta_adi),
    btrim(p_kapak_tipi),
    btrim(p_kapak_size),
    normalized_lot,
    p_son_kul_tarihi,
    coalesce(nullif(btrim(p_pre_balon), ''), 'Yok'),
    coalesce(nullif(btrim(p_post_balon), ''), 'Yok'),
    coalesce(nullif(btrim(p_paravalvuler_ay), ''), 'Yok'),
    p_proglide_adedi,
    btrim(p_crimp_yapan)
  )
  returning id into new_case_id;

  if matching_stock_count = 1 then
    perform public.consume_case_stock_item(
      new_case_id,
      matching_stock.id
    );
  end if;

  return new_case_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_case_stock_item(p_case_id uuid, p_stock_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_user_id uuid := auth.uid();
  case_record public.kapaklar%rowtype;
  stock_record public.kapak_stok%rowtype;
  normalized_case_lot text;
  normalized_stock_lot text;
  case_size integer;
begin
  if not public.kavis_case_write_allowed() then
    raise exception 'Bu işlem için klinik vaka yetkisi gerekli.' using errcode = '42501';
  end if;

  if current_user_id is null then
    raise exception 'Oturum bulunamadı.'
      using errcode = '42501';
  end if;

  select case_item.*
  into case_record
  from public.kapaklar as case_item
  where case_item.id = p_case_id
    and case_item.user_id = current_user_id;

  if not found then
    raise exception 'Vaka bulunamadı veya bu vakaya işlem yetkiniz yok.'
      using errcode = '42501';
  end if;

  select stock_item.*
  into stock_record
  from public.kapak_stok as stock_item
  where stock_item.id = p_stock_id
  for update;

  if not found then
    raise exception 'Stok kaydı bulunamadı.';
  end if;

  if stock_record.durum <> 'stokta' then
    raise exception 'Seçilen kapak artık stokta değil.';
  end if;

  normalized_case_lot := regexp_replace(
    regexp_replace(
      upper(btrim(case_record.lot_no)),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  );

  normalized_stock_lot := regexp_replace(
    regexp_replace(
      upper(btrim(stock_record.lot_no)),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  );

  case_size := substring(case_record.kapak_size from '[0-9]+')::integer;

  if normalized_case_lot is distinct from normalized_stock_lot
    or case_size is distinct from stock_record.kapak_boyutu then
    raise exception 'Vaka ile stok kaydının LOT veya ölçü bilgisi eşleşmiyor.';
  end if;

  update public.kapak_stok
  set
    durum = 'kullanildi',
    kullanilan_vaka_id = case_record.id
  where id = stock_record.id
    and durum = 'stokta';

  if not found then
    raise exception 'Kapak stoktan düşürülemedi; başka bir işlemde kullanılmış olabilir.';
  end if;

  insert into public.stok_hareketleri (
    kapak_stok_id,
    islem,
    urun_adi,
    lot_no,
    kapak_boyutu,
    son_kullanma_tarihi,
    vaka_id,
    created_by
  )
  values (
    stock_record.id,
    'kullanildi',
    stock_record.urun_adi,
    normalized_stock_lot,
    stock_record.kapak_boyutu,
    stock_record.son_kullanma_tarihi,
    case_record.id,
    current_user_id
  );

  return stock_record.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_foc_atomically(p_vaka_id uuid, p_aciklama text, p_foc_stok_id uuid, p_foc_urun_adi text, p_foc_kapak_boyutu integer, p_foc_lot_no text, p_foc_skt date, p_mail_metni text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_user_id uuid := auth.uid();
  case_record public.kapaklar%rowtype;
  foc_stock_record public.kapak_stok%rowtype;
  normalized_case_lot text;
  normalized_foc_lot text;
  case_size integer;
  billing_stock_id uuid;
  existing_foc_id uuid;
  duplicate_case_id uuid;
  duplicate_movement_id uuid;
  duplicate_foc_id uuid;
  matching_local_stock_id uuid;
  new_foc_id uuid;
begin
  if not public.kavis_case_write_allowed() then
    raise exception 'Bu işlem için klinik vaka yetkisi gerekli.' using errcode = '42501';
  end if;

  if current_user_id is null then
    raise exception 'Oturum bulunamadı.'
      using errcode = '42501';
  end if;

  if p_vaka_id is null then
    raise exception 'Vaka kimliği gerekli.';
  end if;

  if nullif(btrim(coalesce(p_aciklama, '')), '') is null then
    raise exception 'FOC olay açıklaması gerekli.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('foc:' || p_vaka_id::text, 0)
  );

  select case_item.*
  into case_record
  from public.kapaklar as case_item
  where case_item.id = p_vaka_id;

  if not found then
    raise exception 'FOC oluşturulacak vaka bulunamadı.';
  end if;

  select foc_record.id
  into existing_foc_id
  from public.foc_kayitlari as foc_record
  where foc_record.vaka_id = p_vaka_id
  limit 1;

  if existing_foc_id is not null then
    raise exception 'Bu vaka için daha önce FOC kaydı oluşturulmuş.'
      using errcode = '23505';
  end if;

  normalized_case_lot := regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(case_record.lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  );

  case_size := nullif(
    substring(
      coalesce(case_record.kapak_size, '')
      from '[0-9]+'
    ),
    ''
  )::integer;

  if case_size is null then
    raise exception 'Fatura edilen kapağın ölçüsü okunamadı.';
  end if;

  normalized_foc_lot := regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(p_foc_lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  );

  if normalized_foc_lot = '' then
    raise exception 'FOC kapağının LOT/SN bilgisi gerekli.';
  end if;

  if p_foc_kapak_boyutu not in (23, 26, 29, 34) then
    raise exception 'FOC kapağının ölçüsü geçersiz.';
  end if;

  if p_foc_skt is null then
    raise exception 'FOC kapağının son kullanma tarihi gerekli.';
  end if;

  if normalized_foc_lot = normalized_case_lot
    and p_foc_kapak_boyutu = case_size then
    raise exception 'Fatura edilen kapak ile FOC düşülen kapak aynı olamaz.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'valve:' || normalized_foc_lot || ':' || p_foc_kapak_boyutu::text,
      0
    )
  );

  select used_case.id
  into duplicate_case_id
  from public.kapaklar as used_case
  where regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(used_case.lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  ) = normalized_foc_lot
    and nullif(
      substring(
        coalesce(used_case.kapak_size, '')
        from '[0-9]+'
      ),
      ''
    )::integer = p_foc_kapak_boyutu
  limit 1;

  if duplicate_case_id is not null then
    raise exception
      'FOC kapağı LOT/SN (%) ve ölçü (% mm) daha önce bir vakada kullanılmış.',
      normalized_foc_lot,
      p_foc_kapak_boyutu
      using errcode = '23505';
  end if;

  select movement_record.id
  into duplicate_movement_id
  from public.stok_hareketleri as movement_record
  where movement_record.islem = 'kullanildi'
    and regexp_replace(
      regexp_replace(
        upper(btrim(coalesce(movement_record.lot_no, ''))),
        '[[:space:]]+',
        '',
        'g'
      ),
      '(\(20\)01|2001)$',
      '',
      'i'
    ) = normalized_foc_lot
    and movement_record.kapak_boyutu = p_foc_kapak_boyutu
  limit 1;

  if duplicate_movement_id is not null then
    raise exception
      'FOC kapağı LOT/SN (%) ve ölçü (% mm) daha önce stoktan kullanılmış.',
      normalized_foc_lot,
      p_foc_kapak_boyutu
      using errcode = '23505';
  end if;

  select foc_record.id
  into duplicate_foc_id
  from public.foc_kayitlari as foc_record
  where regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(foc_record.foc_lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  ) = normalized_foc_lot
    and foc_record.foc_kapak_boyutu = p_foc_kapak_boyutu
  limit 1;

  if duplicate_foc_id is not null then
    raise exception
      'Bu FOC kapağı LOT/SN (%) ve ölçü (% mm) daha önce FOC kaydında kullanılmış.',
      normalized_foc_lot,
      p_foc_kapak_boyutu
      using errcode = '23505';
  end if;

  select stock_record.id
  into billing_stock_id
  from public.kapak_stok as stock_record
  where regexp_replace(
    regexp_replace(
      upper(btrim(coalesce(stock_record.lot_no, ''))),
      '[[:space:]]+',
      '',
      'g'
    ),
    '(\(20\)01|2001)$',
    '',
    'i'
  ) = normalized_case_lot
    and stock_record.kapak_boyutu = case_size
  limit 1;

  if p_foc_stok_id is not null then
    select stock_record.*
    into foc_stock_record
    from public.kapak_stok as stock_record
    where stock_record.id = p_foc_stok_id
    for update;

    if not found then
      raise exception 'Seçilen FOC stok kaydı bulunamadı.';
    end if;

    if foc_stock_record.durum <> 'stokta' then
      raise exception 'Seçilen FOC kapağı artık stokta değil.';
    end if;

    if regexp_replace(
      regexp_replace(
        upper(btrim(coalesce(foc_stock_record.lot_no, ''))),
        '[[:space:]]+',
        '',
        'g'
      ),
      '(\(20\)01|2001)$',
      '',
      'i'
    ) <> normalized_foc_lot
      or foc_stock_record.kapak_boyutu <> p_foc_kapak_boyutu then
      raise exception 'Seçilen FOC kapağının LOT veya ölçü bilgisi stokla eşleşmiyor.';
    end if;

    p_foc_urun_adi := foc_stock_record.urun_adi;
    p_foc_skt := foc_stock_record.son_kullanma_tarihi;
  else
    if nullif(btrim(coalesce(p_foc_urun_adi, '')), '') is null then
      raise exception 'FOC kapağının ürün adı gerekli.';
    end if;

    select stock_record.id
    into matching_local_stock_id
    from public.kapak_stok as stock_record
    where regexp_replace(
      regexp_replace(
        upper(btrim(coalesce(stock_record.lot_no, ''))),
        '[[:space:]]+',
        '',
        'g'
      ),
      '(\(20\)01|2001)$',
      '',
      'i'
    ) = normalized_foc_lot
      and stock_record.kapak_boyutu = p_foc_kapak_boyutu
    limit 1;

    if matching_local_stock_id is not null then
      raise exception 'Bu FOC kapağı yerel stokta kayıtlı. Manuel giriş yerine stoktan seçin.';
    end if;
  end if;

  insert into public.foc_kayitlari (
    vaka_id,
    user_id,
    aciklama,
    fatura_edilen_stok_id,
    fatura_edilen_urun_adi,
    fatura_edilen_kapak_boyutu,
    fatura_edilen_lot_no,
    fatura_edilen_skt,
    foc_stok_id,
    foc_urun_adi,
    foc_kapak_boyutu,
    foc_lot_no,
    foc_skt,
    mail_metni
  )
  values (
    case_record.id,
    current_user_id,
    btrim(p_aciklama),
    billing_stock_id,
    case_record.kapak_tipi,
    case_size,
    normalized_case_lot,
    case_record.son_kul_tarihi,
    p_foc_stok_id,
    btrim(p_foc_urun_adi),
    p_foc_kapak_boyutu,
    normalized_foc_lot,
    p_foc_skt,
    coalesce(p_mail_metni, '')
  )
  returning id into new_foc_id;

  if p_foc_stok_id is not null then
    update public.kapak_stok
    set
      durum = 'kullanildi',
      kullanilan_vaka_id = case_record.id
    where id = foc_stock_record.id
      and durum = 'stokta';

    if not found then
      raise exception 'FOC kapağı stoktan düşürülemedi; başka bir işlemde kullanılmış olabilir.';
    end if;

    insert into public.stok_hareketleri (
      kapak_stok_id,
      islem,
      urun_adi,
      lot_no,
      kapak_boyutu,
      son_kullanma_tarihi,
      vaka_id,
      created_by
    )
    values (
      foc_stock_record.id,
      'kullanildi',
      foc_stock_record.urun_adi,
      normalized_foc_lot,
      foc_stock_record.kapak_boyutu,
      foc_stock_record.son_kullanma_tarihi,
      case_record.id,
      current_user_id
    );
  end if;

  return new_foc_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ana_depo_barkod_girisi(p_gtin text, p_lot_no text, p_son_kullanma_tarihi date, p_barkod_raw text, p_uretim_tarihi date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gtin text := regexp_replace(coalesce(p_gtin, ''), '[^0-9]', '', 'g');
  v_lot text := upper(trim(coalesce(p_lot_no, '')));
  v_katalog public.ana_depo_urun_katalogu%rowtype;
  v_urun_id uuid;
  v_onceki integer;
begin
  if auth.uid() is null or not public.ana_depo_yonetebilir() then
    raise exception 'Bu işlem için ana depo yetkisi gerekli';
  end if;

  if v_gtin !~ '^[0-9]{14}$' then
    raise exception 'Geçersiz ÜBB/GTIN: 14 rakam bekleniyor';
  end if;
  if v_lot = '' then
    raise exception 'Barkodda LOT (10) alanı bulunamadı';
  end if;
  if p_son_kullanma_tarihi is null then
    raise exception 'Barkodda SKT (17) alanı bulunamadı';
  end if;

  select * into v_katalog
  from public.ana_depo_urun_katalogu
  where gtin = v_gtin and aktif = true;

  if not found then
    raise exception 'Bu ÜBB/GTIN ürün kataloğunda tanımlı değil: %', v_gtin;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kavis-depo:' || v_gtin || ':' || v_lot, 0));

  select id, adet into v_urun_id, v_onceki
  from public.ana_depo_urunleri
  where gtin = v_gtin and upper(trim(lot_no)) = v_lot and aktif = true
  for update;

  if found then
    update public.ana_depo_urunleri
    set adet = v_onceki + 1,
        barkod_raw = p_barkod_raw,
        son_kullanma_tarihi = p_son_kullanma_tarihi,
        uretim_tarihi = coalesce(p_uretim_tarihi, uretim_tarihi),
        ref_no = coalesce(v_katalog.ref_no, ref_no)
    where id = v_urun_id;

    insert into public.ana_depo_hareketleri
      (urun_id, islem, miktar, onceki_adet, sonraki_adet, aciklama, created_by)
    values
      (v_urun_id, 'giris', 1, v_onceki, v_onceki + 1, 'Barkod ile stok girişi', auth.uid());
  else
    insert into public.ana_depo_urunleri (
      urun_tipi, urun_adi, beden_olcu, lot_no, son_kullanma_tarihi,
      adet, kritik_stok, created_by, gtin, ref_no, barkod_raw, uretim_tarihi
    ) values (
      v_katalog.urun_tipi, v_katalog.urun_adi, v_katalog.beden_olcu,
      v_lot, p_son_kullanma_tarihi, 1, 0, auth.uid(), v_gtin,
      v_katalog.ref_no, p_barkod_raw, p_uretim_tarihi
    ) returning id into v_urun_id;

    insert into public.ana_depo_hareketleri
      (urun_id, islem, miktar, onceki_adet, sonraki_adet, aciklama, created_by)
    values
      (v_urun_id, 'giris', 1, 0, 1, 'İlk barkod ile stok girişi', auth.uid());
  end if;

  return v_urun_id;
end;
$function$
;

revoke execute on function public.ana_depo_urun_olustur(text,text,text,text,date,integer,integer)
from public, anon, authenticated;

-- API access verifies warehouse permissions inside all stock RPCs.
-- Existing transfer RPCs and Ankara source behavior are retained.
commit;
