-- Run once in the Supabase SQL editor for the parcel_claims table.
--
-- Adds claim_status_changed_at, stamped by the API only when claim_status
-- itself is part of a PATCH (see pages/api/parcel-claims/[id].js) — distinct
-- from the existing updated_at, which bumps on any edit at all. Lets the
-- team see how long a claim has actually sat at its current status, not just
-- when it was last touched.

alter table parcel_claims add column if not exists claim_status_changed_at timestamptz;
