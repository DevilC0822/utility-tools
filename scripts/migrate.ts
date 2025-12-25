/**
 * 数据库迁移脚本
 * 使用方式: pnpm db:migrate
 */
import { config } from "dotenv";
import postgres from "postgres";

// 加载 .env.local 环境变量
config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL 环境变量未配置");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: "prefer",
  max: 1,
});

async function migrate() {
  console.log("🚀 开始数据库迁移...\n");

  try {
    // 创建统计表
    await sql`
      CREATE TABLE IF NOT EXISTS stats (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
      )
    `;
    console.log("✅ stats 表已就绪");

    // 创建访问日志表
    await sql`
      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        tool VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
      )
    `;
    console.log("✅ access_logs 表已就绪");

    // 为 access_logs 表添加索引（如果不存在）
    await sql`
      CREATE INDEX IF NOT EXISTS idx_access_logs_tool ON access_logs (tool)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs (created_at)
    `;
    console.log("✅ access_logs 索引已就绪");

    console.log("\n🎉 迁移完成！");
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
