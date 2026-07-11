# Deployment Guide

## Environment Setup

Create a `.env.local` file at the project root with the following variables:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (exposed to browser) | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon key (exposed to browser) | Long base64 string |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — server-only, bypasses RLS; used in admin routes and `requireMember()` | Long base64 string |
| `GEMINI_API_KEY` | Google Gemini API key — server-only, used in `src/lib/ai/gemini.ts` | Long string |

### Optional Variables (Multi-Provider AI System)

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| `MODELS` | Comma-separated list of supported AI model IDs in format `<provider>/<modelName>` | `gemini/gemini-3.1-flash-image-preview` | First entry is the default model. Parsed by `getConfiguredModels()` in `src/lib/ai/providers/types.ts`. |
| `VILAO_API_KEY` | VILAO API key — server-only, required only if `vilao/*` entries exist in `MODELS` | (none) | Placeholder only; user must supply real secret before enabling VILAO models. |
| `VILAO_BASE_URL` | VILAO API endpoint base URL — server-only | `https://api.vilao.ai/v1/images/edits` | Used only if `vilao/*` models are configured. Not verified as production-ready. |

## Multi-Provider Configuration

### Gemini Only (Default)

If `MODELS` is unset or empty, the system defaults to Gemini:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
# MODELS not set → defaults to ["gemini/gemini-3.1-flash-image-preview"]
```

### Gemini + VILAO

To enable VILAO alongside Gemini, set all three variables:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
VILAO_API_KEY=your_real_vilao_secret_here
VILAO_BASE_URL=https://api.vilao.ai/v1/images/edits  # or your actual endpoint
MODELS=gemini/gemini-3.1-flash-image-preview,vilao/gtm/gpt-image-2
```

**Important**: The first entry in `MODELS` is the default model selected in the chat panel. Order matters for UX.

### Model ID Format

Model IDs follow the pattern `<provider>/<modelName>`. The provider and model name are split on the **first `/` only**, allowing VILAO model names to contain slashes:

- ✅ `gemini/gemini-3.1-flash-image-preview` → provider: `gemini`, modelName: `gemini-3.1-flash-image-preview`
- ✅ `vilao/gtm/gpt-image-2` → provider: `vilao`, modelName: `gtm/gpt-image-2`

## VILAO Setup (Not Yet Production-Verified)

VILAO is an OpenAI-compatible image-edit service. The implementation is complete but requires manual verification before production use:

### Prerequisites

1. **VILAO API Key**: Obtain from VILAO's dashboard or contact their support
2. **Confirmed Base URL**: Verify the correct API endpoint (currently assumed to be `https://api.vilao.ai/v1/images/edits`)
3. **Test Round-Trip**: Once key and URL are confirmed, add a test model entry to `MODELS` and fire a real AI edit to validate the full integration

### Steps to Enable VILAO

1. **Add placeholder to `.env.local`** (already done by setup script):
   ```bash
   VILAO_API_KEY=placeholder_until_confirmed
   ```

2. **Obtain real API key** from VILAO and update `.env.local`:
   ```bash
   VILAO_API_KEY=your_actual_secret
   ```

3. **Confirm the base URL** with VILAO (default assumption is `https://api.vilao.ai/v1/images/edits`):
   ```bash
   VILAO_BASE_URL=https://api.vilao.ai/v1/images/edits
   ```

4. **Add a test entry to `MODELS`**:
   ```bash
   MODELS=gemini/gemini-3.1-flash-image-preview,vilao/gtm/gpt-image-2
   ```

5. **Validate end-to-end**: Upload an image, draw a selection box, and send an AI edit request. Monitor:
   - Chat panel shows the VILAO model in the dropdown
   - Edit request succeeds (or fails with a clear error message from VILAO, not a timeout)
   - Edited image appears in the canvas

6. **Once verified**, the VILAO configuration is production-ready. If issues arise, check:
   - API key is valid for VILAO's current authentication scheme
   - Base URL matches VILAO's actual endpoint
   - Network connectivity and firewall rules allow outbound HTTPS to VILAO
   - VILAO's image format expectations (PNG, base64 encoding, mask handling)

### Known Limitations

- **Not production-verified**: VILAO's backend response format, error messages, and mask interpretation may differ from assumptions. Manual testing required.
- **Multi-image handling**: VILAO receives the target picture plus optional context images (all pictures referenced in mentions). This behavior is not yet confirmed against VILAO's real API.
- **Mask behavior**: VILAO receives a transparent PNG mask defining editable regions (generated from selection box coordinates). Actual behavior depends on VILAO's image-generation model's mask interpretation.
- **Error messages**: Provider errors are surfaced verbatim to the chat panel. VILAO's error format may differ from Gemini's.

## Database Setup

### Supabase Schema

Run the following SQL in your Supabase SQL editor to initialize the database:

```sql
-- profiles table (auto-created by Supabase on user signup, managed by trigger)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  user_type TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- admin_settings table
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default admin settings
INSERT INTO admin_settings (key, value) VALUES
  ('compress_images', false),
  ('compress_width', 1920)
ON CONFLICT (key) DO NOTHING;

-- RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read for profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, user_type, created_at, updated_at)
  VALUES (NEW.id, 'guest', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### First Admin User

After schema setup, manually update your own user's role in the Supabase SQL editor:

```sql
UPDATE profiles
SET user_type = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

Then upgrade other users to `member` via the Admin Panel (`/admin` or `?admin=1`) once logged in.

## Disk Storage

The `data/` directory is created automatically on first run:

```
data/
├── admin-settings.json      # Persisted admin settings (compression, etc.)
└── projects/
    └── <projectId>/
        ├── project.json     # Project metadata, pictures, boxes, chat history
        ├── pictures/        # Current picture PNG files
        └── versions/        # Per-version snapshots (up to 20)
            └── <versionId>/
                └── <pictureId>.png
```

**Important**: The `data/` directory is **not committed to git** (listed in `.gitignore`). Back it up separately if needed.

## Running the Application

### Development

```bash
npm install
npm run dev
```

Runs at `http://localhost:3000`.

### Production Build

```bash
npm run build
npm run start
```

### Environment in Production

Ensure all environment variables are set in your deployment platform (Vercel, Railway, Docker, etc.):
- For Vercel: set via the project dashboard → Settings → Environment Variables
- For Docker: pass via `docker run -e VARIABLE=value` or `.env` file (use `.env.local` locally, never commit secrets)
- For Railway/Render: set via the dashboard's environment variable section

**Security note**: Never commit `.env.local` to git. Use a secret management tool or platform-specific environment setup for production.

## Running Tests

```bash
npm run test              # Unit tests (Vitest, single pass)
npm run test:watch       # Unit tests (watch mode)
npm run test:e2e         # End-to-end tests (Playwright)
```

## Linting and Type Checking

```bash
npm run lint             # ESLint
tsc --noEmit            # Type check without emitting
npm run build           # Build + type check
```

## Deployment Checklist

- [ ] All required environment variables are set (SUPABASE_*, GEMINI_API_KEY)
- [ ] Supabase schema is initialized (profiles, admin_settings, RLS, trigger)
- [ ] At least one user is promoted to `admin` role
- [ ] If using VILAO: real API key and confirmed base URL are set, and a test edit succeeds
- [ ] `npm run build` passes without errors
- [ ] Tests pass: `npm run test` and `npm run test:e2e`
- [ ] Data directory backups are configured (if applicable)
- [ ] `.env.local` is in `.gitignore` and never committed
- [ ] HTTPS is enforced (Supabase cookies require secure connections in production)
