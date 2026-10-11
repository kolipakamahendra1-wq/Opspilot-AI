CREATE EXTENSION IF NOT EXISTS vector;
-- Read-only role for the agent's SQL tool. Table grants are applied by init_db().
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opspilot_ro') THEN
    CREATE ROLE opspilot_ro LOGIN PASSWORD 'opspilot_ro';
  END IF;
END $$;
ALTER ROLE opspilot_ro SET statement_timeout = '3s';
ALTER ROLE opspilot_ro SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE opspilot TO opspilot_ro;
GRANT USAGE ON SCHEMA public TO opspilot_ro;
