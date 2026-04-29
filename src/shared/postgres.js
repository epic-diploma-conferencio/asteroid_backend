const { Pool } = require('pg')
const config = require('./config')

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.maxPoolSize
})

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      login VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(60) NOT NULL,
      last_name VARCHAR(60) NOT NULL,
      avatar_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `)
}

async function ensureResearchSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS research_sessions (
      session_id UUID PRIMARY KEY,
      user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      source_name TEXT NOT NULL,
      language VARCHAR(32) NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 1,
      job_id VARCHAR(128) NOT NULL,
      result_object_key TEXT NULL,
      graph_payload JSONB NULL,
      analysis_payload JSONB NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS researches (
      id UUID PRIMARY KEY,
      user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      session_id UUID NOT NULL REFERENCES research_sessions(session_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NULL,
      language VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'processing',
      preview TEXT NOT NULL DEFAULT '',
      rule_style VARCHAR(32) NOT NULL DEFAULT 'balanced',
      selected_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
      graph_overview JSONB NOT NULL DEFAULT '{}'::jsonb,
      graph_by_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
      cards JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_saved BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_researches_user_id_created_at
    ON researches(user_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_researches_session_id ON researches(session_id);
  `)
}

module.exports = {
  pool,
  ensureAuthSchema,
  ensureResearchSchema
}