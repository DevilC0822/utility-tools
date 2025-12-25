import {
  getTotalVisits,
  getToolStats,
  incrTotalVisits,
  incrToolUsage,
} from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取统计数据
export async function GET() {
  try {
    const [totalVisits, toolStats] = await Promise.all([
      getTotalVisits(),
      getToolStats(),
    ]);

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
      await incrTotalVisits();
    } else if (type === "tool" && tool) {
      await incrToolUsage(tool);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("记录统计失败:", error);
    return NextResponse.json({ error: "记录失败" }, { status: 500 });
  }
}
