-- Custom SQL migration file, put your code below! --
-- Kill switch row (claude.md section 7.2). A missing row means MCP is disabled; seed it on
-- so the connector works after setup. Toggle it off from /settings in an emergency.
INSERT INTO "app_settings" ("key", "value") VALUES ('mcp_enabled', 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;
