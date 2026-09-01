-- LeadPulse: company brand logos (paste into Supabase SQL editor, project mkyhikarlxuwvprjabbi)
-- Run once. MCP OAuth is down, so this is the manual path.

-- 1) Column on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

-- 2) Public storage bucket for logos (id must match the app: 'company-logos')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 262144, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 262144,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif'];

-- 3) RLS on storage.objects.
--    The app uses the anon key, so "anon" / "authenticated" both map to the
--    public client. Enforce the same mime+size guard server-side
--    (metadata->'mimetype' and metadata->'size' are written by the client
--    upload; this is defense-in-depth on top of client validation).
DROP POLICY IF EXISTS "company-logos public read" ON storage.objects;
CREATE POLICY "company-logos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "company-logos anon insert" ON storage.objects;
CREATE POLICY "company-logos anon insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND (COALESCE((metadata->>'mimetype') LIKE 'image/%', false))
    AND (COALESCE((metadata->>'size')::int <= 262144, false))
  );

DROP POLICY IF EXISTS "company-logos anon update" ON storage.objects;
CREATE POLICY "company-logos anon update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'company-logos')
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (COALESCE((metadata->>'mimetype') LIKE 'image/%', false))
    AND (COALESCE((metadata->>'size')::int <= 262144, false))
  );

DROP POLICY IF EXISTS "company-logos anon delete" ON storage.objects;
CREATE POLICY "company-logos anon delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'company-logos');
