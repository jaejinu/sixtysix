BEGIN;
-- A narrow lock operation, not write permission on the media catalog.
CREATE FUNCTION sixtysix.lock_active_sample_photo(photo_ref text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ref FROM sixtysix.sample_photos
    WHERE ref = photo_ref AND retired_at IS NULL FOR SHARE;
  RETURN FOUND;
END
$$;
REVOKE ALL ON FUNCTION sixtysix.lock_active_sample_photo(text) FROM PUBLIC;
COMMIT;
