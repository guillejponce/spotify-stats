You are helping me build a Spotify Companion Dashboard — a personal stats app 
connected to my Spotify account that shows live and historical listening data.

## Stack
- Frontend: Next.js 14 (App Router) + TypeScript
- Styling: Tailwind CSS + shadcn/ui
- Backend/DB: Supabase (PostgreSQL + Realtime + Storage)
- Auth: Supabase Auth with Spotify OAuth
- Deployment: Vercel
- API: Spotify Web API (via Authorization Code Flow)

## Core Features

### 1. Live Stats (Spotify API polling every 30s)
- Now Playing widget: album art, track name, artist, progress bar
- Updates now_playing table in Supabase via API route
- Use Supabase Realtime to push updates to the UI without refresh

### 2. Historical Stats (from Spotify JSON export uploads)
Data comes from Spotify's "Extended Streaming History" JSON export.
Each record has: ts, ms_played, master_metadata_track_name, 
master_metadata_album_artist_name, master_metadata_album_album_name,
spotify_track_uri, reason_start, reason_end, shuffle, offline, platform

Upload flow:
- User uploads JSON file(s) via drag & drop
- API route parses and upserts data into: artists, albums, tracks, plays tables
- Shows import progress in real time (import stored in `imports` table)
- Skips duplicate plays (dedup by track_id + played_at)

### 3. Stats Dashboard
Build reusable chart components for the following stats, 
all with time filters: all time / by year / by month / by week / by day / by hour

LISTENING TIME:
- Total minutes/hours listened (all time, per year, per month, per day, per hour of day)
- Average daily listening time
- Listening heatmap (GitHub-style) by day of year

TOP CONTENT (with temporal filters):
- Top tracks (by play count and by ms_played)
- Top artists (by play count and by ms_played)
- Top albums (by play count and by ms_played)
- Top genres (aggregated from artist genres array)

PATTERNS:
- Most active listening hour of day (bar chart)
- Most active day of week
- Listening over time (line chart: plays per day/week/month)
- Skip rate per artist / track
- Platform breakdown (mobile vs desktop vs web)
- Shuffle vs non-shuffle ratio

DISCOVERIES:
- First time you listened to each artist/track
- Longest listening streak (days in a row)
- Most played track on a single day

## Database (Supabase/PostgreSQL)
Tables: artists, albums, tracks, plays, now_playing, imports
(schema already defined — use it as source of truth)

All stats queries should be done via Supabase RPC (PostgreSQL functions) 
or direct SQL queries from server components. Never compute stats client-side.

## UI/UX Guidelines
- Dark theme (spotify-like: black/dark gray + green accents)
- Sidebar navigation with sections: Now Playing / Dashboard / History / Import
- Use recharts or Victory for charts
- Mobile responsive
- Skeleton loaders while data loads
- Empty states when no data

## File Structure
/app
  /api
    /spotify/callback   -- OAuth callback
    /spotify/now-playing -- polling endpoint
    /import             -- JSON upload + parsing
  /(dashboard)
    /page.tsx           -- main stats dashboard  
    /history/page.tsx   -- historical browser
    /import/page.tsx    -- upload page
/components
  /now-playing/
  /stats/
  /charts/
  /import/
/lib
  /spotify.ts     -- Spotify API client
  /supabase.ts    -- Supabase client
  /stats.ts       -- stat query helpers