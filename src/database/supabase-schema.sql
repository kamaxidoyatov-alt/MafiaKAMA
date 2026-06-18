-- =============================================
-- 🎭 MafiaBOT — Supabase PostgreSQL Schema
-- =============================================
-- Run this SQL in your Supabase project's SQL Editor
-- =============================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  is_admin BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT DEFAULT '',
  stats JSONB DEFAULT '{"totalGames":0,"wins":0,"losses":0,"winsAsMafia":0,"winsAsPeaceful":0,"winsAsDon":0,"winsAsCommissar":0,"winsAsDoctor":0,"winsAsManiac":0,"winsAsSheriff":0,"winsAsBodyguard":0,"winsAsMistress":0,"kills":0,"deaths":0,"saves":0,"checks":0,"votesCast":0,"survived":0}',
  rating INTEGER DEFAULT 1000,
  rating_history JSONB DEFAULT '[]',
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  current_room_id TEXT,
  language TEXT DEFAULT 'ru',
  warnings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_stats_total_games ON users(((stats->>'totalGames')::int) DESC);

-- 2. Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT 'Комната Мафии',
  type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  creator_id BIGINT NOT NULL,
  max_players INTEGER DEFAULT 10 CHECK (max_players >= 4 AND max_players <= 16),
  players JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{"dayDuration":60,"nightDuration":45,"voteDuration":40,"roles":[],"autoStart":true,"isRanked":true}',
  current_game_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_type_status ON rooms(type, status);

-- 3. Games table
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT UNIQUE NOT NULL,
  room_code TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('waiting', 'in_progress', 'finished', 'cancelled')),
  phase TEXT DEFAULT 'lobby' CHECK (phase IN ('lobby', 'day', 'night', 'vote', 'finished')),
  round INTEGER DEFAULT 1,
  players JSONB DEFAULT '[]',
  night_action_queue JSONB DEFAULT '[]',
  current_night_actor BIGINT,
  last_vote_result JSONB,
  night_results JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  winner TEXT CHECK (winner IN ('mafia', 'peaceful', 'maniac', 'draw')),
  max_players INTEGER DEFAULT 10,
  phase_timestamps JSONB DEFAULT '{}',
  phase_durations JSONB DEFAULT '{"day":60,"night":45,"vote":40}',
  is_ranked BOOLEAN DEFAULT true,
  game_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games indexes
CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_players ON games USING gin(players);

-- 4. Game logs table
CREATE TABLE IF NOT EXISTS game_logs (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  round INTEGER DEFAULT 1,
  phase TEXT NOT NULL CHECK (phase IN ('lobby', 'day', 'night', 'vote', 'finished')),
  event_type TEXT NOT NULL,
  actor_id BIGINT,
  actor_name TEXT DEFAULT '',
  target_id BIGINT,
  target_name TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game logs indexes
CREATE INDEX IF NOT EXISTS idx_game_logs_game_id ON game_logs(game_id);
CREATE INDEX IF NOT EXISTS idx_game_logs_game_round ON game_logs(game_id, round);
CREATE INDEX IF NOT EXISTS idx_game_logs_created_at ON game_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_event_type ON game_logs(event_type, created_at DESC);

-- 5. Player stats table
CREATE TABLE IF NOT EXISTS player_stats (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  total JSONB DEFAULT '{"games":0,"wins":0,"losses":0,"draws":0,"kills":0,"deaths":0,"saves":0,"survived":0}',
  by_role JSONB DEFAULT '{
    "peaceful":{"games":0,"wins":0,"survived":0},
    "mafia":{"games":0,"wins":0,"kills":0,"survived":0},
    "don":{"games":0,"wins":0,"kills":0,"survived":0},
    "commissar":{"games":0,"wins":0,"checks":0,"correctChecks":0,"survived":0},
    "doctor":{"games":0,"wins":0,"saves":0,"survived":0},
    "maniac":{"games":0,"wins":0,"kills":0,"survived":0},
    "sheriff":{"games":0,"wins":0,"checks":0,"correctChecks":0,"survived":0},
    "bodyguard":{"games":0,"wins":0,"protects":0,"survived":0},
    "mistress":{"games":0,"wins":0,"blocks":0,"survived":0}
  }',
  daily_stats JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  streaks JSONB DEFAULT '{"currentWinStreak":0,"maxWinStreak":0,"currentLoseStreak":0,"maxLoseStreak":0}',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player stats indexes
CREATE INDEX IF NOT EXISTS idx_player_stats_telegram_id ON player_stats(telegram_id);

-- =============================================
-- Helper: trigger to auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply auto-update triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at') THEN
    CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_rooms_updated_at') THEN
    CREATE TRIGGER set_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_games_updated_at') THEN
    CREATE TRIGGER set_games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_game_logs_updated_at') THEN
    CREATE TRIGGER set_game_logs_updated_at BEFORE UPDATE ON game_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_player_stats_updated_at') THEN
    CREATE TRIGGER set_player_stats_updated_at BEFORE UPDATE ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
