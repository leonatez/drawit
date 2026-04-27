-- Run this in your Supabase SQL editor

-- profiles table extends auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  user_type TEXT NOT NULL DEFAULT 'guest' CHECK (user_type IN ('guest', 'member', 'premium', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- AI usage tracking (reset automatically by server)
  ai_daily_count         INTEGER  NOT NULL DEFAULT 0,
  ai_daily_reset_date    DATE     NOT NULL DEFAULT CURRENT_DATE,
  ai_monthly_count       INTEGER  NOT NULL DEFAULT 0,
  ai_monthly_reset_month SMALLINT NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::SMALLINT,
  ai_monthly_reset_year  SMALLINT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT
);

-- admin_settings table (singleton row)
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  compress_images BOOLEAN NOT NULL DEFAULT FALSE,
  compress_width INT NOT NULL DEFAULT 500,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.admin_settings (id, compress_images, compress_width)
VALUES (1, FALSE, 500)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update own display_name (not user_type)
CREATE POLICY "users_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (user_type = (SELECT user_type FROM public.profiles WHERE id = auth.uid()));

-- Admin can read all profiles
CREATE POLICY "admin_read_all" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

-- Admin can update all profiles
CREATE POLICY "admin_update_all" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

-- Admin can read/update settings
CREATE POLICY "admin_settings_read" ON public.admin_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type IN ('admin', 'member', 'guest'))
    OR auth.uid() IS NOT NULL
  );

CREATE POLICY "admin_settings_update" ON public.admin_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, user_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'guest'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── AI usage tracking columns (idempotent migrations for existing DBs) ────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_daily_count         INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_daily_reset_date    DATE     NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_monthly_count       INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_monthly_reset_month SMALLINT NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::SMALLINT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_monthly_reset_year  SMALLINT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT;

-- ─── Payment system ───────────────────────────────────────────────────────────

-- Add subscription expiry to profiles (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Pricing plans (managed via Supabase table editor)
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  description TEXT,
  user_type   TEXT    NOT NULL CHECK (user_type IN ('member', 'premium')),
  price_vnd   INTEGER NOT NULL,
  ai_daily_limit   INTEGER NOT NULL,
  ai_monthly_limit INTEGER NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed plans (idempotent via unique name constraint)
ALTER TABLE public.pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_name_key;
ALTER TABLE public.pricing_plans ADD CONSTRAINT pricing_plans_name_key UNIQUE (name);

INSERT INTO public.pricing_plans (name, description, user_type, price_vnd, ai_daily_limit, ai_monthly_limit, sort_order)
VALUES
  ('Member',  '10 AI requests/day · 50/month', 'member',  50000,  10, 50,  1),
  ('Premium', '50 AI requests/day · 250/month', 'premium', 100000, 50, 250, 2)
ON CONFLICT (name) DO NOTHING;

-- Payment orders
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id      UUID NOT NULL REFERENCES public.pricing_plans(id),
  order_code   TEXT NOT NULL UNIQUE,
  amount_vnd   INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  paid_at      TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ
);

-- RLS for pricing_plans: anyone can read active plans
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_plans_public_read" ON public.pricing_plans
  FOR SELECT USING (active = TRUE);

-- RLS for payment_orders: users read/insert their own
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_read_own" ON public.payment_orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON public.payment_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
