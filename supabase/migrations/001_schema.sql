create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists select_own_profile on profiles;
drop policy if exists insert_own_profile on profiles;
drop policy if exists update_own_profile on profiles;

create policy select_own_profile on profiles for select to authenticated using (auth.uid() = id);
create policy insert_own_profile on profiles for insert to authenticated with check (auth.uid() = id);
create policy update_own_profile on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists kapaklar (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  vaka_tarihi date not null,
  merkez_hastane text not null,
  doktor text not null,
  hasta_adi text not null,
  kapak_tipi text not null,
  kapak_size text not null,
  lot_no text not null,
  son_kul_tarihi date not null,
  pre_balon text not null default 'Yok',
  post_balon text not null default 'Yok',
  paravalvuler_ay text not null default 'Yok',
  proglide_adedi integer not null default 1,
  crimp_yapan text not null,
  created_at timestamptz default now()
);

alter table kapaklar enable row level security;

drop policy if exists select_own_kapaklar on kapaklar;
drop policy if exists insert_own_kapaklar on kapaklar;
drop policy if exists update_own_kapaklar on kapaklar;
drop policy if exists delete_own_kapaklar on kapaklar;

create policy select_own_kapaklar on kapaklar for select to authenticated using (auth.uid() = user_id);
create policy insert_own_kapaklar on kapaklar for insert to authenticated with check (auth.uid() = user_id);
create policy update_own_kapaklar on kapaklar for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy delete_own_kapaklar on kapaklar for delete to authenticated using (auth.uid() = user_id);
