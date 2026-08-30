CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS external_user_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_ref)
);

CREATE TABLE IF NOT EXISTS favorite_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_ref_id uuid NOT NULL REFERENCES external_user_refs(id),
  station_id text NOT NULL,
  transport_mode text NOT NULL,
  usual_days text[] NOT NULL DEFAULT '{}',
  usual_time_start time,
  usual_time_end time,
  delay_threshold_minutes integer NOT NULL CHECK (delay_threshold_minutes >= 0),
  max_budget numeric(10, 2),
  notification_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transit_disruptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  station_id text NOT NULL,
  transport_mode text NOT NULL,
  delay_minutes integer,
  status text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('LIVE', 'FIXTURE', 'MOCK')),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id, observed_at)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  name text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  radius_meters integer NOT NULL CHECK (radius_meters > 0),
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE INDEX IF NOT EXISTS missions_location_gix ON missions USING gist(location);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  external_user_ref text NOT NULL,
  aggregate_id text,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
