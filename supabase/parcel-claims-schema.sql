-- Missing Parcels / Courier Claims tracker (Returns & Comms team).
-- Run this once in the Supabase SQL editor for the project already wired up
-- via SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (same project as the wishlist
-- feature — see wishlist-schema.sql).

create extension if not exists "pgcrypto";

create table if not exists parcel_claims (
  id uuid primary key default gen_random_uuid(),
  date_started date not null default current_date,
  customer_name text not null,
  email text,
  ebay_username text,
  courier text not null default 'DPD',
  consignment_ref text,
  retail numeric(10,2),
  cost numeric(10,2),
  claim_amount numeric(10,2),
  claim_ref text,
  -- Replaces the old sheet's colour-coded status key (column A):
  -- investigating | lost_refunded_hv | claim_processed | claim_thrown_out |
  -- delivered_ok | delivered_after_refund
  stage text not null default 'investigating',
  -- Replaces the old sheet's second colour key (column E), optional:
  -- rts_after_deemed_lost | never_scanned | drop_off_shop_issue |
  -- lod_sent_not_refunded | mislabeled_by_courier
  issue_type text,
  -- Replaces the old single Denial/Settled tick:
  -- not_applicable | required_not_sent | form_sent | form_received | settled | denied
  claim_status text not null default 'not_applicable',
  claim_form_sent_at date,
  claim_form_received_at date,
  notes text,
  handled_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parcel_claims_email_idx on parcel_claims (lower(email));
create index if not exists parcel_claims_ebay_idx on parcel_claims (lower(ebay_username));
create index if not exists parcel_claims_name_idx on parcel_claims (lower(customer_name));
create index if not exists parcel_claims_stage_idx on parcel_claims (stage);
create index if not exists parcel_claims_status_idx on parcel_claims (claim_status);
create index if not exists parcel_claims_date_idx on parcel_claims (date_started);
