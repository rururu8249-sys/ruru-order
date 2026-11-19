-- Read-only admin member detail reuses existing 90-day visitor_visits.
-- The city/region is derived from first-party Vercel request headers on NEW visits.
-- Old visit rows remain NULL; no geolocation is guessed from historical IPs.
ALTER TABLE public.visitor_visits ADD COLUMN IF NOT EXISTS region_label text;
COMMENT ON COLUMN public.visitor_visits.region_label IS 'Approximate IP-derived city/region on visit; may be null; retained under existing 90-day visit purge';
