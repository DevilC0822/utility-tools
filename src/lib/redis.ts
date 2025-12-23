import { Redis } from "@upstash/redis";

// 项目专属前缀
const PREFIX = "utility-tools";

// 初始化 Redis 客户端
export const redis = Redis.fromEnv();

/**
 * 生成带前缀的 key
 */
export function prefixKey(key: string): string {
  return `${PREFIX}:${key}`;
}

/**
 * 获取数据
 */
export async function get<T>(key: string): Promise<T | null> {
  return redis.get<T>(prefixKey(key));
}

/**
 * 设置数据
 * @param ttl 过期时间（秒），可选
 */
export async function set<T>(
  key: string,
  value: T,
  ttl?: number
): Promise<void> {
  if (ttl) {
    await redis.set(prefixKey(key), value, { ex: ttl });
  } else {
    await redis.set(prefixKey(key), value);
  }
}

/**
 * 删除数据
 */
export async function del(key: string): Promise<void> {
  await redis.del(prefixKey(key));
}

/**
 * 自增计数
 */
export async function incr(key: string): Promise<number> {
  return redis.incr(prefixKey(key));
}

/**
 * 检查 key 是否存在
 */
export async function exists(key: string): Promise<boolean> {
  const result = await redis.exists(prefixKey(key));
  return result === 1;
}
