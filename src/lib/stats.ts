// 统计数据类型
export interface Stats {
  totalVisits: number;
  toolStats: Record<string, number>;
}

// 检查是否为开发环境
function isDev(): boolean {
  return process.env.NODE_ENV === "development";
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

// 记录页面访问（fire-and-forget 模式，每次会话只记录一次）
export function recordVisit(): void {
  if (isDev()) return;
  if (typeof window === "undefined") return;

  // 使用 sessionStorage 实现会话级去重：关闭网页后清除，刷新时保留
  const key = "stats:visit";
  if (sessionStorage.getItem(key)) return;

  sessionStorage.setItem(key, "1");

  fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "visit" }),
  }).catch(() => {
    sessionStorage.removeItem(key);
  });
}

// 记录工具使用（fire-and-forget 模式，每次使用都计数）
export function recordToolUsage(tool: string): void {
  if (isDev()) return;

  fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "tool", tool }),
  }).catch(() => {
    // 静默失败
  });
}
