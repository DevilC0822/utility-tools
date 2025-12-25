import postgres from "postgres";

// PostgreSQL 连接配置
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL 环境变量未配置");
}

// 创建数据库连接
export const sql = postgres(connectionString, {
  ssl: "prefer",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// 统计 key 定义
const KEYS = {
  totalVisits: "stats:total_visits",
  toolUsage: (tool: string) => `stats:tool:${tool}`,
};

/**
 * 获取统计值
 */
export async function getStatValue(key: string): Promise<number> {
  const result = await sql`
    SELECT value FROM stats WHERE key = ${key}
  `;
  return result.length > 0 ? result[0].value : 0;
}

/**
 * 增加统计值（使用 UTC+8 时间）
 */
export async function incrStatValue(key: string): Promise<number> {
  const result = await sql`
    INSERT INTO stats (key, value, updated_at)
    VALUES (${key}, 1, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
    ON CONFLICT (key)
    DO UPDATE SET value = stats.value + 1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
    RETURNING value
  `;
  return result[0].value;
}

/**
 * 获取总访问量
 */
export async function getTotalVisits(): Promise<number> {
  return getStatValue(KEYS.totalVisits);
}

/**
 * 增加访问量
 */
export async function incrTotalVisits(): Promise<number> {
  return incrStatValue(KEYS.totalVisits);
}

/**
 * 获取所有工具使用统计
 */
export async function getToolStats(): Promise<Record<string, number>> {
  const result = await sql`
    SELECT key, value FROM stats WHERE key LIKE 'stats:tool:%'
  `;

  const toolStats: Record<string, number> = {};
  for (const row of result) {
    const toolName = row.key.replace("stats:tool:", "");
    toolStats[toolName] = row.value;
  }
  return toolStats;
}

/**
 * 增加工具使用次数
 */
export async function incrToolUsage(tool: string): Promise<number> {
  return incrStatValue(KEYS.toolUsage(tool));
}

/**
 * 记录工具访问日志（使用 UTC+8 时间）
 */
export async function logToolAccess(tool: string): Promise<void> {
  await sql`
    INSERT INTO access_logs (tool, created_at)
    VALUES (${tool}, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
  `;
}

/**
 * 访问日志记录类型
 */
export interface AccessLog {
  id: number;
  tool: string;
  created_at: Date;
}

/**
 * 获取最近的访问日志
 */
export async function getRecentAccessLogs(limit = 100): Promise<AccessLog[]> {
  const result = await sql`
    SELECT id, tool, created_at
    FROM access_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result as unknown as AccessLog[];
}
