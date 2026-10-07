-- The desktop app reports its version on each request, so the account page
-- can show it's installed and whether an update is out.
ALTER TABLE app_tokens ADD COLUMN app_version TEXT;
