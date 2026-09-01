-- LeadPulse: FIX company-logos RLS (paste into Supabase SQL editor, project mkyhikarlxuwvprjabbi)
-- The previous insert/update policy checked metadata->'mimetype'/'size', which the
-- JS client does NOT send (those are written by the storage engine AFTER the row
-- exists, so at WITH CHECK time they are NULL -> every insert was denied).
-- Fix: gate on bucket_id + folder only. Real mime/size enforcement comes from the
-- bucket's allowed_mime_types + file_size_limit (already set), not from RLS.

DROP POLICY IF EXISTS "company-logos anon insert" ON storage.objects;
CREATE POLICY "company-logos anon insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = 'logos'
  );

DROP POLICY IF EXISTS "company-logos anon update" ON storage.objects;
CREATE POLICY "company-logos anon update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'company-logos')
  WITH CHECK (bucket_id = 'company-logos');

-- Keep the public read + delete policies as-is.
