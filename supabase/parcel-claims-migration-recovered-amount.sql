-- Run once in the Supabase SQL editor for the parcel_claims table.
--
-- Adds a dedicated "recovered_amount" column, separate from claim_amount.
-- claim_amount is what was submitted/requested from the courier; DPD doesn't
-- always pay out that full figure, so recovered_amount tracks what was
-- actually paid back once a claim is settled. Falls back to claim_amount
-- (then cost) in the stats calculation for existing rows that predate this
-- column, so nothing needs backfilling.

alter table parcel_claims add column if not exists recovered_amount numeric(10,2);
