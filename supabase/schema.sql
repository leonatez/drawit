-- Run this in your Supabase SQL editor

-- profiles table extends auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  user_type TEXT NOT NULL DEFAULT 'guest' CHECK (user_type IN ('guest', 'member', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), 'guest');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
