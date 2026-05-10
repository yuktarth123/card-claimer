-- Create the 'card-videos' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-videos', 'card-videos', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policy to allow anonymous users to upload files to 'card-videos'
-- This policy allows INSERT operations for the 'anon' role.
CREATE POLICY "Allow anon video uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'card-videos');

-- Optionally, you might want policies for SELECT (read) and DELETE if needed for anon users
-- CREATE POLICY "Allow anon video reads"
-- ON storage.objects FOR SELECT
-- TO anon
-- USING (bucket_id = 'card-videos');

-- CREATE POLICY "Allow authenticated video deletes"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (bucket_id = 'card-videos');