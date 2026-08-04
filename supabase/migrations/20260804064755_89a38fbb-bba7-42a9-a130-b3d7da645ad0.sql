
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'baller'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  photo_url text,
  difficulty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courts TO anon, authenticated;
GRANT INSERT ON public.courts TO authenticated;
GRANT ALL ON public.courts TO service_role;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courts_public_read" ON public.courts FOR SELECT USING (true);
CREATE POLICY "courts_insert_auth" ON public.courts FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'free_throws',
  total_shots integer NOT NULL DEFAULT 5,
  difficulty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenges TO anon, authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges_public_read" ON public.challenges FOR SELECT USING (true);

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  court_id uuid REFERENCES public.courts(id) ON DELETE SET NULL,
  shots_made integer NOT NULL DEFAULT 0,
  shots_total integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.attempts TO authenticated;
GRANT ALL ON public.attempts TO service_role;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_own_read" ON public.attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "attempts_own_insert" ON public.attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rarity text NOT NULL DEFAULT 'common',
  artwork_url text,
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cards TO anon, authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards_public_read" ON public.cards FOR SELECT USING (true);

CREATE TABLE public.user_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  source_challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  court_id uuid REFERENCES public.courts(id) ON DELETE SET NULL,
  earned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_cards TO authenticated;
GRANT ALL ON public.user_cards TO service_role;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_cards_own_read" ON public.user_cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_cards_own_insert" ON public.user_cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_cards_user ON public.user_cards(user_id);
CREATE INDEX idx_attempts_user ON public.attempts(user_id);
CREATE INDEX idx_challenges_court ON public.challenges(court_id);

INSERT INTO public.courts (name, lat, lng, address, difficulty) VALUES
('Rucker Park', 40.8296, -73.9364, '280 W 155th St, New York, NY', 5),
('West 4th Street Courts (The Cage)', 40.7315, -74.0007, '1 Sixth Ave, New York, NY', 5),
('Tompkins Square Park Courts', 40.7265, -73.9815, '500 E 9th St, New York, NY', 3),
('Brooklyn Bridge Park Courts', 40.7003, -73.9967, '150 Furman St, Brooklyn, NY', 2),
('Dyckman Park', 40.8659, -73.9270, 'Nagle Ave & Dyckman St, New York, NY', 4),
('Chelsea Park Courts', 40.7500, -74.0016, '435 W 25th St, New York, NY', 2),
('Venice Beach Courts', 33.9871, -118.4736, '1800 Ocean Front Walk, Venice, CA', 4),
('Golden Gate Park Courts', 37.7694, -122.4862, 'Golden Gate Park, San Francisco, CA', 3);

INSERT INTO public.challenges (court_id, type, total_shots, difficulty)
SELECT id, 'free_throws', 5, difficulty FROM public.courts;

INSERT INTO public.cards (name, rarity, stats_json) VALUES
('Corner Sniper', 'common', '{"shooting":72,"handles":60,"hops":58,"theme":"#f97316"}'),
('Playground Rookie', 'common', '{"shooting":64,"handles":66,"hops":61,"theme":"#fb923c"}'),
('Chain Net Kid', 'common', '{"shooting":68,"handles":55,"hops":70,"theme":"#f59e0b"}'),
('Bench Spark', 'common', '{"shooting":61,"handles":71,"hops":64,"theme":"#fbbf24"}'),
('Streetball Grinder', 'common', '{"shooting":70,"handles":68,"hops":57,"theme":"#ea580c"}'),
('Blacktop Runner', 'common', '{"shooting":66,"handles":73,"hops":66,"theme":"#f97316"}'),
('Backboard Beast', 'common', '{"shooting":59,"handles":58,"hops":78,"theme":"#c2410c"}'),
('Free Throw Metronome', 'common', '{"shooting":79,"handles":52,"hops":50,"theme":"#fdba74"}'),
('Crossover Artist', 'rare', '{"shooting":80,"handles":89,"hops":74,"theme":"#38bdf8"}'),
('Midnight Marksman', 'rare', '{"shooting":88,"handles":72,"hops":69,"theme":"#0ea5e9"}'),
('Glass Cleaner', 'rare', '{"shooting":70,"handles":66,"hops":90,"theme":"#22d3ee"}'),
('Lockdown Wing', 'rare', '{"shooting":76,"handles":78,"hops":85,"theme":"#2dd4bf"}'),
('Transition Bullet', 'rare', '{"shooting":78,"handles":84,"hops":82,"theme":"#60a5fa"}'),
('Buzzer Beater', 'rare', '{"shooting":86,"handles":75,"hops":72,"theme":"#818cf8"}'),
('Skywalker', 'epic', '{"shooting":88,"handles":86,"hops":97,"theme":"#a855f7"}'),
('The Architect', 'epic', '{"shooting":92,"handles":94,"hops":78,"theme":"#c026d3"}'),
('Ice in the Veins', 'epic', '{"shooting":96,"handles":85,"hops":76,"theme":"#7c3aed"}'),
('Court Vision King', 'epic', '{"shooting":89,"handles":97,"hops":80,"theme":"#d946ef"}'),
('Rim Wrecker', 'epic', '{"shooting":84,"handles":80,"hops":99,"theme":"#8b5cf6"}'),
('The Franchise', 'legendary', '{"shooting":99,"handles":97,"hops":95,"theme":"#facc15"}'),
('Asphalt Legend', 'legendary', '{"shooting":97,"handles":99,"hops":93,"theme":"#eab308"}'),
('Mr. Unlimited Range', 'legendary', '{"shooting":100,"handles":92,"hops":88,"theme":"#fde047"}'),
('The Closer', 'legendary', '{"shooting":98,"handles":95,"hops":96,"theme":"#f59e0b"}'),
('Ghost of Rucker', 'legendary', '{"shooting":99,"handles":98,"hops":99,"theme":"#fbbf24"}');
