-- Wishlist schema for the custom wishlist replacing Swym.
-- Run this once in the Supabase SQL editor for the new dedicated wishlist project.

create extension if not exists "pgcrypto";

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id text,
  guest_token uuid,
  product_id text not null,
  variant_id text,
  created_at timestamptz not null default now(),
  constraint wishlist_items_owner_check check (
    (customer_id is not null and guest_token is null)
    or (customer_id is null and guest_token is not null)
  )
);

create unique index if not exists wishlist_items_customer_product_key
  on wishlist_items (customer_id, product_id)
  where customer_id is not null;

create unique index if not exists wishlist_items_guest_product_key
  on wishlist_items (guest_token, product_id)
  where guest_token is not null;

create table if not exists wishlist_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('add', 'remove', 'merge')),
  customer_id text,
  guest_token uuid,
  product_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists wishlist_events_product_id_idx on wishlist_events (product_id);
create index if not exists wishlist_events_created_at_idx on wishlist_events (created_at);
