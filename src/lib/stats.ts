// 统计数据类型
export interface Stats {
  totalVisits: number;
  toolStats: Record<string, number>;
}

// 检查是否为开发环境
function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

// 获取今天的日期字符串
function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

// 检查今天是否已记录过（基于 localStorage）
function hasRecordedToday(key: string): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(`stats:${key}`);
  return stored === getTodayKey();
}

// 标记今天已记录
function markRecordedToday(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`stats:${key}`, getTodayKey());
}

// 获取统计数据（带超时和错误处理）
export async function fetchStats(): Promise<Stats | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch("/api/stats", {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// 记录页面访问（fire-and-forget 模式）
export function recordVisit(): void {
  if (isDev()) return;
  if (hasRecordedToday("visit")) return;

  // 标记为已记录（乐观更新）
  markRecordedToday("visit");

  // 异步发送，不等待结果
  fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "visit" }),
  }).catch(() => {
    // 发送失败时回滚标记，下次再试
    localStorage.removeItem("stats:visit");
  });
}

// 记录工具使用（fire-and-forget 模式）
export function recordToolUsage(tool: string): void {
  if (isDev()) return;
  const key = `tool:${tool}`;
  if (hasRecordedToday(key)) return;

  // 标记为已记录（乐观更新）
  markRecordedToday(key);

  // 异步发送，不等待结果
  fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "tool", tool }),
  }).catch(() => {
    // 发送失败时回滚标记，下次再试
    localStorage.removeItem(`stats:${key}`);
  });
}
