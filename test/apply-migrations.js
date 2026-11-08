import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

// Dùng đúng file migrations/*.sql mà bản triển khai thật sẽ chạy
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
