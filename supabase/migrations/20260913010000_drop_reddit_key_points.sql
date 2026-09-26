-- Reverted in favor of using existing social_keywords for direct, verbatim
-- search-keyword control instead — see reddit_marketing_key_points_and_cache
-- for the original (short-lived) intent.
alter table brands drop column if exists reddit_key_points;
