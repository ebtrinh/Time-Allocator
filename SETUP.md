# Setup Instructions

## 1. Create Supabase Project

1. Go to https://supabase.com and create a free account
2. Create a new project
3. Go to **SQL Editor** and run this SQL:

```sql
CREATE TABLE time_allocator (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable realtime (optional)
ALTER TABLE time_allocator REPLICA IDENTITY FULL;

-- Insert default row
INSERT INTO time_allocator (id, data) VALUES ('default', '{"activities":[],"log":[],"lastDate":null,"yesterday":null,"portions":6}');

-- Enable Row Level Security (RLS) - open access for simplicity
ALTER TABLE time_allocator ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON time_allocator FOR ALL USING (true);
```

## 2. Get Your API Keys

1. In Supabase, go to **Settings** > **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

## 3. Update index.html

Open `index.html` and replace these lines near the top of the `<script>` section:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

## 4. Deploy to Vercel

```bash
cd time-allocator
npx vercel
```

Or push to GitHub and connect to Vercel.

## 5. Access Anywhere

Your data now syncs to the cloud. Access from any device!
