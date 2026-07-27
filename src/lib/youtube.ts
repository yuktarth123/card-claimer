// Accepts a bare video ID or any common YouTube URL shape (watch?v=, youtu.be/,
// /embed/, /live/) and returns just the 11-character ID. Falls back to
// returning the trimmed input unchanged if nothing matches, so a bare ID
// still passes through untouched.
export function extractYouTubeId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : trimmed;
}
