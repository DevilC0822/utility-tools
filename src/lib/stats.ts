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

// 获取统计数据
export async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error("获取统计失败");
  return res.json();
}

// 记录页面访问（每用户每天仅一次）
export async function recordVisit(): Promise<void> {
  if (isDev()) return;
  if (hasRecordedToday("visit")) return;

  await fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "visit" }),
  });
  markRecordedToday("visit");
}

// 记录工具使用（每工具每用户每天仅一次）
export async function recordToolUsage(tool: string): Promise<void> {
  if (isDev()) return;
  if (hasRecordedToday(`tool:${tool}`)) return;

  await fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "tool", tool }),
  });
  markRecordedToday(`tool:${tool}`);
}
