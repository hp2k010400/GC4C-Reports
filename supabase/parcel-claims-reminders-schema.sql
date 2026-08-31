-- Run once in the Supabase SQL editor for the parcel_claims project.
--
-- Reminders for the Missing Parcels / Courier Claims tracker's new Calendar
-- tab. claim_id is optional — a reminder can be tied to a specific claim
-- (e.g. "chase this claim in 7 days") or freeform/general (e.g. "call DPD
-- account manager"), same access model as parcel_claims itself: no RLS,
-- only ever touched server-side via the service-role key behind the page's
-- password gate.

create table if not exists parcel_claim_reminders (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references parcel_claims(id) on delete cascade,
  title text not null,
  notes text,
  due_date date not null,
  done boolean not null default false,
  done_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists parcel_claim_reminders_due_idx on parcel_claim_reminders (due_date);
create index if not exists parcel_claim_reminders_claim_idx on parcel_claim_reminders (claim_id);
create index if not exists parcel_claim_reminders_done_idx on parcel_claim_reminders (done);
