import { redis, prefixKey } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

// 统计 key 定义
const KEYS = {
  totalVisits: "stats:total_visits",
  toolUsage: (tool: string) => `stats:tool:${tool}`,
};

// GET: 获取统计数据
export async function GET() {
  try {
    // 获取总访问量
    const totalVisits = (await redis.get<number>(prefixKey(KEYS.totalVisits))) || 0;

    // 获取所有工具使用统计
    const toolKeys = await redis.keys(prefixKey("stats:tool:*"));
    const toolStats: Record<string, number> = {};

    if (toolKeys.length > 0) {
      const values = await redis.mget<number[]>(...toolKeys);
      toolKeys.forEach((key, index) => {
        const toolName = key.replace(prefixKey("stats:tool:"), "");
        toolStats[toolName] = values[index] || 0;
      });
    }

    return NextResponse.json({
      totalVisits,
      toolStats,
    });
  } catch (error) {
    console.error("获取统计数据失败:", error);
    return NextResponse.json({ error: "获取统计失败" }, { status: 500 });
  }
}

// POST: 记录访问
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, tool } = body;

    if (type === "visit") {
      // 记录总访问量
      await redis.incr(prefixKey(KEYS.totalVisits));
    } else if (type === "tool" && tool) {
      // 记录工具使用次数
      await redis.incr(prefixKey(KEYS.toolUsage(tool)));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("记录统计失败:", error);
    return NextResponse.json({ error: "记录失败" }, { status: 500 });
  }
}
