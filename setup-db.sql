CREATE TABLE IF NOT EXISTS recipients (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  "group" TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_schedules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  schedule_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  active BOOLEAN DEFAULT true NOT NULL,
  recipient_ids TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id VARCHAR NOT NULL,
  schedule_id VARCHAR,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
  error_message TEXT
);