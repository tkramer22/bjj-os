-- ═══════════════════════════════════════════════════════════════════
-- BJJ OS MULTI-AGENT INTELLIGENCE SYSTEM
-- Database Schema Deployment Script (CORRECTED)
-- 
-- INSTRUCTIONS:
-- 1. Connect to Supabase database using SQL editor
-- 2. Run this entire script to create all required tables
-- 3. After successful deployment, enable multi-agent system in multi-agent-integration.ts
-- ═══════════════════════════════════════════════════════════════════

-- Table 1: Prof Queries (query tracking)
CREATE TABLE IF NOT EXISTS prof_queries (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  query TEXT NOT NULL,
  query_type VARCHAR DEFAULT 'chat',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_queries_user ON prof_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_prof_queries_created ON prof_queries(created_at DESC);

-- Table 2: Video Interactions (engagement tracking)
CREATE TABLE IF NOT EXISTS video_interactions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  video_id INTEGER,
  query_id INTEGER REFERENCES prof_queries(id),
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMP,
  watch_duration INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  saved_to_library BOOLEAN DEFAULT FALSE,
  shared_with_others BOOLEAN DEFAULT FALSE,
  thumbs_up BOOLEAN DEFAULT FALSE,
  thumbs_down BOOLEAN DEFAULT FALSE,
  rewatch_count INTEGER DEFAULT 0,
  problem_solved BOOLEAN DEFAULT FALSE,
  start_timestamp INTEGER,
  device_type VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_interactions_user ON video_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_video_interactions_video ON video_interactions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_interactions_query ON video_interactions(query_id);
CREATE INDEX IF NOT EXISTS idx_video_interactions_clicked ON video_interactions(clicked);
CREATE INDEX IF NOT EXISTS idx_video_interactions_created ON video_interactions(created_at DESC);

-- Table 3: Recommendation Outcomes (learning loop tracking)
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  query_id INTEGER NOT NULL REFERENCES prof_queries(id),
  video_id INTEGER NOT NULL,
  recommendation_rank INTEGER,
  algorithm VARCHAR,
  relevance_score NUMERIC(5, 2),
  pedagogy_score NUMERIC(5, 2),
  engagement_prediction NUMERIC(5, 2),
  clicked BOOLEAN DEFAULT FALSE,
  helpful BOOLEAN,
  solved_problem BOOLEAN,
  actual_engagement VARCHAR,
  actual_learning_gain VARCHAR,
  prediction_accuracy VARCHAR,
  follow_up_query_sentiment VARCHAR,
  asked_same_problem_again BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  evaluated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendation_user ON recommendation_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_query ON recommendation_outcomes(query_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_video ON recommendation_outcomes(video_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_algorithm ON recommendation_outcomes(algorithm);
CREATE INDEX IF NOT EXISTS idx_recommendation_created ON recommendation_outcomes(created_at DESC);

-- Table 4: Model Performance (AI model tracking)
CREATE TABLE IF NOT EXISTS model_performance (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  accuracy NUMERIC(5, 2),
  latency INTEGER,
  cost_per_call NUMERIC(10, 6),
  call_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  user_satisfaction NUMERIC(5, 2),
  prediction_accuracy NUMERIC(5, 2),
  measurement_period TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance(model_name);
CREATE INDEX IF NOT EXISTS idx_model_performance_task ON model_performance(task_type);
CREATE INDEX IF NOT EXISTS idx_model_performance_period ON model_performance(period_start DESC);

-- Table 5: Query Analysis (interpreter insights)
CREATE TABLE IF NOT EXISTS query_analysis (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  query_id INTEGER NOT NULL REFERENCES prof_queries(id),
  raw_query TEXT NOT NULL,
  
  -- Layer 1: Linguistic Analysis
  explicit_technique TEXT,
  explicit_position TEXT,
  question_type TEXT,
  
  -- Layer 2: Intent Inference
  inferred_intent TEXT,
  root_problem TEXT,
  likely_mistakes TEXT[],
  
  -- Layer 3: User Profile Inference
  inferred_skill_level TEXT,
  inferred_learning_style TEXT,
  emotional_state TEXT,
  urgency TEXT,
  
  -- Layer 4: Learning Path
  optimal_learning_path JSONB,
  prerequisite_check JSONB,
  follow_up_concepts TEXT[],
  
  -- Recommendation strategy
  recommendation_strategy TEXT,
  presentation_style TEXT,
  
  -- Model used
  analysis_model TEXT NOT NULL,
  confidence NUMERIC(3, 2),
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_analysis_user ON query_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_query_analysis_query ON query_analysis(query_id);
CREATE INDEX IF NOT EXISTS idx_query_analysis_intent ON query_analysis(inferred_intent);
CREATE INDEX IF NOT EXISTS idx_query_analysis_skill ON query_analysis(inferred_skill_level);

-- Table 6: Learning Path Recommendations (synthesizer output)
CREATE TABLE IF NOT EXISTS learning_path_recommendations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  query_id INTEGER NOT NULL REFERENCES prof_queries(id),
  primary_video_id INTEGER NOT NULL,
  foundation_video_ids INTEGER[],
  troubleshooting_video_ids INTEGER[],
  progression_video_ids INTEGER[],
  conceptual_framing TEXT,
  encouragement TEXT,
  metacognitive_guidance TEXT,
  path_completed BOOLEAN DEFAULT FALSE,
  videos_watched INTEGER DEFAULT 0,
  learning_outcome TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learning_path_user ON learning_path_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_query ON learning_path_recommendations(query_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_outcome ON learning_path_recommendations(learning_outcome);

-- Table 7: AB Test Experiments (evaluator testing)
CREATE TABLE IF NOT EXISTS ab_test_experiments (
  id SERIAL PRIMARY KEY,
  experiment_name TEXT NOT NULL UNIQUE,
  description TEXT,
  control_algorithm TEXT NOT NULL,
  treatment_algorithm TEXT NOT NULL,
  traffic_split NUMERIC(3, 2) DEFAULT 0.50,
  status TEXT DEFAULT 'active',
  control_engagement NUMERIC(5, 2),
  treatment_engagement NUMERIC(5, 2),
  control_satisfaction NUMERIC(5, 2),
  treatment_satisfaction NUMERIC(5, 2),
  statistical_significance NUMERIC(5, 4),
  winner TEXT,
  conclusion TEXT,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_status ON ab_test_experiments(status);
CREATE INDEX IF NOT EXISTS idx_ab_test_started ON ab_test_experiments(started_at DESC);

-- Table 8: Web Search Log (web search tracking)
CREATE TABLE IF NOT EXISTS web_search_log (
  id SERIAL PRIMARY KEY,
  query_id INTEGER REFERENCES prof_queries(id),
  search_type TEXT NOT NULL,
  search_query TEXT NOT NULL,
  results_found BOOLEAN DEFAULT FALSE,
  result_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_search_query ON web_search_log(query_id);
CREATE INDEX IF NOT EXISTS idx_web_search_type ON web_search_log(search_type);
CREATE INDEX IF NOT EXISTS idx_web_search_created ON web_search_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS (adjust role name as needed for your setup)
-- ═══════════════════════════════════════════════════════════════════

-- Grant all privileges on tables to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- DEPLOYMENT VERIFICATION
-- ═══════════════════════════════════════════════════════════════════

-- Run this query to verify all tables were created successfully:
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN (
    'prof_queries',
    'video_interactions', 
    'recommendation_outcomes',
    'model_performance',
    'query_analysis',
    'learning_path_recommendations',
    'ab_test_experiments',
    'web_search_log'
  )
ORDER BY table_name;

-- Expected output: 8 tables with proper column counts
-- If you see all 8 tables, deployment was successful!

-- ═══════════════════════════════════════════════════════════════════
-- POST-DEPLOYMENT: Enable Multi-Agent System
-- ═══════════════════════════════════════════════════════════════════
--
-- After running this script successfully:
-- 1. Update server/multi-agent-integration.ts
-- 2. Change DEFAULT_CONFIG.enabled = true
-- 3. Change DEFAULT_CONFIG.enableEngagementTracking = true
-- 4. Restart the application
-- 5. Test with a Prof. OS query to verify engagement tracking
--
-- ═══════════════════════════════════════════════════════════════════
