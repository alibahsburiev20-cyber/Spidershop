-- Spidershop database schema
-- Run this once in Supabase SQL Editor.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- profiles: seller profile linked 1:1 with auth.users
-- =========================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  bio          text,
  avatar_url   text,
  ton_address  text,
  is_admin     boolean default false,
  created_at   timestamptz default now()
);

-- Auto-create a profile row when a new auth.user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- products
-- =========================================================
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.profiles(id) on delete cascade,
  slug          text,
  title         text not null,
  description   text,
  cover_path    text,                -- key in 'covers' bucket (public)
  file_path     text,                -- key in 'products' bucket (private)
  file_name     text,
  file_size     bigint,
  price_usd     numeric(12, 2) not null check (price_usd >= 0),
  is_published  boolean default true,
  sales_count   integer default 0,
  created_at    timestamptz default now()
);
create index if not exists products_seller_idx on public.products (seller_id);
create index if not exists products_published_idx on public.products (is_published, created_at desc);

-- =========================================================
-- orders
-- =========================================================
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete restrict,
  seller_id      uuid not null references public.profiles(id) on delete restrict,
  buyer_email    text,
  amount_usd     numeric(12, 2) not null,
  amount_ton     numeric(18, 6) not null,
  ton_rate_usd   numeric(12, 4) not null,   -- TON/USD at order time
  pay_address    text not null,
  pay_memo       text not null unique,      -- "sp-XXXXXX"
  status         text not null default 'pending',  -- pending | paid | expired | delivered
  download_token text unique,
  download_count integer default 0,
  download_limit integer default 5,
  tx_hash        text,
  created_at     timestamptz default now(),
  paid_at        timestamptz,
  expires_at     timestamptz not null default (now() + interval '30 minutes')
);
create index if not exists orders_product_idx on public.orders (product_id);
create index if not exists orders_seller_idx  on public.orders (seller_id);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_memo_idx    on public.orders (pay_memo);
create index if not exists orders_token_idx   on public.orders (download_token);

-- =========================================================
-- payouts: 95 / 5 ledger
-- =========================================================
create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete restrict,
  seller_amount   numeric(18, 6) not null,   -- 95 %
  platform_fee   numeric(18, 6) not null,   -- 5 %
  status          text not null default 'pending',  -- pending | sent | failed
  payout_tx       text,
  sent_at         timestamptz,
  created_at      timestamptz default now()
);
create index if not exists payouts_seller_idx on public.payouts (seller_id);
create index if not exists payouts_status_idx on public.payouts (status);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.payouts  enable row level security;

-- profiles
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- products
drop policy if exists "products_select_published_or_own" on public.products;
create policy "products_select_published_or_own"
  on public.products for select
  using (is_published = true or seller_id = auth.uid());

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own"
  on public.products for insert
  with check (seller_id = auth.uid());

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own"
  on public.products for update using (seller_id = auth.uid());

drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own"
  on public.products for delete using (seller_id = auth.uid());

-- orders: sellers see their orders only; buyers are anonymous and accessed via service_role
drop policy if exists "orders_select_seller" on public.orders;
create policy "orders_select_seller"
  on public.orders for select using (seller_id = auth.uid());

-- payouts: seller sees own; admins see all
drop policy if exists "payouts_select_own" on public.payouts;
create policy "payouts_select_own"
  on public.payouts for select using (
    seller_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Admins can mark payouts as sent
drop policy if exists "payouts_admin_update" on public.payouts;
create policy "payouts_admin_update"
  on public.payouts for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- =========================================================
-- Storage policies
-- =========================================================
-- Run these AFTER creating buckets 'covers' (public) and 'products' (private)
-- in Storage UI.

-- covers: anyone can read; only owner uploads under own seller_id folder
drop policy if exists "covers_read" on storage.objects;
create policy "covers_read" on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists "covers_owner_insert" on storage.objects;
create policy "covers_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "covers_owner_update" on storage.objects;
create policy "covers_owner_update" on storage.objects
  for update using (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "covers_owner_delete" on storage.objects;
create policy "covers_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- products: no public read; owner uploads/manages; downloads happen via signed URL from server
drop policy if exists "products_owner_select" on storage.objects;
create policy "products_owner_select" on storage.objects
  for select using (
    bucket_id = 'products'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "products_owner_insert" on storage.objects;
create policy "products_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'products'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "products_owner_update" on storage.objects;
create policy "products_owner_update" on storage.objects
  for update using (
    bucket_id = 'products'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "products_owner_delete" on storage.objects;
create policy "products_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'products'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
