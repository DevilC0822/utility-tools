"use client";

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import Link from "next/link";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ImageOff,
  Minimize2,
  RefreshCw,
  Code2,
  Braces,
  Palette,
  Zap,
  Shield,
  Clock,
  ArrowRight,
  Eye,
  MousePointerClick,
} from "lucide-react";
import { fetchStats, recordVisit, type Stats } from "@/lib/stats";

// Tool definitions
const tools = [
  {
    id: "gemini-watermark",
    name: "Gemini 去水印",
    description: "使用反向 Alpha 混合算法精确还原原始像素，移除 Gemini、Nano Banana 生成图片的水印",
    icon: ImageOff,
    color: "mint",
    href: "/tools/gemini-watermark",
    tags: ["图片处理"],
    online: true,
  },
  {
    id: "image-compress",
    name: "图片压缩",
    description: "智能压缩图片体积，保持最佳画质，支持批量处理",
    icon: Minimize2,
    color: "coral",
    href: "/tools/image-compress",
    tags: ["图片处理"],
    online: false,
  },
  {
    id: "format-convert",
    name: "格式转换",
    description: "支持 PNG、JPG、WebP、AVIF 等多种格式互转",
    icon: RefreshCw,
    color: "purple",
    href: "/tools/format-convert",
    tags: ["图片处理"],
    online: false,
  },
  {
    id: "base64-tool",
    name: "Base64 编解码",
    description: "快速进行 Base64 编码解码，支持文本和图片",
    icon: Code2,
    color: "mint",
    href: "/tools/base64",
    tags: ["编码"],
    online: false,
  },
  {
    id: "json-formatter",
    name: "JSON 格式化",
    description: "美化、压缩、校验 JSON 数据，支持语法高亮",
    icon: Braces,
    color: "coral",
    href: "/tools/json-formatter",
    tags: ["开发工具"],
    online: false,
  },
  {
    id: "color-picker",
    name: "颜色提取器",
    description: "从图片中提取主色调，生成配色方案",
    icon: Palette,
    color: "purple",
    href: "/tools/color-picker",
    tags: ["设计"],
    online: false,
  },
];

// 提取所有唯一标签
const allTags = Array.from(new Set(tools.flatMap((tool) => tool.tags)));

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

// Tool Card Component with Ripple Effect
function ToolCard({ tool }: { tool: (typeof tools)[0] }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 800);
  }, []);

  const colorClasses = {
    mint: "text-[#64ffda]",
    coral: "text-[#ff6b9d]",
    purple: "text-[#a78bfa]",
  };

  const IconComponent = tool.icon;

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div
        className={`glass-card tool-card group relative ${
          !tool.online ? "opacity-60 cursor-not-allowed" : ""
        }`}
        onMouseEnter={tool.online ? handleMouseEnter : undefined}
      >
        {/* 覆盖整个卡片的链接层，仅在上线时可点击 */}
        {tool.online && (
          <Link
            href={tool.href}
            className="absolute inset-0 z-0"
            aria-label={tool.name}
          />
        )}

        {/* 即将上线标签 */}
        {!tool.online && (
          <div className="absolute top-4 right-4 z-10">
            <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/50 border border-white/10">
              即将上线
            </span>
          </div>
        )}

        {/* Ripple container */}
        <div className="ripple-container">
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="ripple"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: 100,
                height: 100,
                marginLeft: -50,
                marginTop: -50,
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div className={`icon-wrapper ${tool.color} relative z-10 pointer-events-none`}>
          <IconComponent
            className={`w-6 h-6 ${colorClasses[tool.color as keyof typeof colorClasses]}`}
            strokeWidth={1.5}
          />
        </div>

        {/* Content - 可选择复制 */}
        <div className="space-y-2 relative z-10 select-text pointer-events-auto">
          <h3 className={`heading-display text-lg transition-colors ${
            tool.online ? "text-white group-hover:text-[#64ffda]" : "text-white/70"
          }`}>
            {tool.name}
          </h3>
          <p className="text-sm text-white/60 leading-relaxed min-h-[2.75rem] line-clamp-2">
            {tool.description}
          </p>
        </div>

        {/* Tags - 可选择复制 */}
        <div className="flex flex-wrap gap-2 mt-2 relative z-10 select-text pointer-events-auto">
          {tool.tags.map((tag) => (
            <span key={tag} className="tag text-xs">
              {tag}
            </span>
          ))}
        </div>

        {/* Arrow indicator - 仅在上线时显示 */}
        {tool.online && (
          <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 z-10 pointer-events-none">
            <ArrowRight className="w-5 h-5 text-[#64ffda]" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Home() {
  // 标签过滤状态，空数组表示"全部"
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 统计数据
  const [stats, setStats] = useState<Stats | null>(null);

  // 加载统计数据并记录访问
  useEffect(() => {
    recordVisit();
    fetchStats().then(setStats).catch(console.error);
  }, []);

  // 处理标签点击
  const handleTagClick = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      if (tag === "全部") {
        return [];
      }
      if (prev.includes(tag)) {
        // 取消选中该标签
        return prev.filter((t) => t !== tag);
      } else {
        // 选中该标签
        return [...prev, tag];
      }
    });
  }, []);

  // 根据选中标签过滤工具
  const filteredTools = useMemo(() => {
    if (selectedTags.length === 0) {
      return tools;
    }
    return tools.filter((tool) =>
      tool.tags.some((tag) => selectedTags.includes(tag))
    );
  }, [selectedTags]);

  return (
    <div className="min-h-screen relative">
      {/* Liquid Background */}
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="liquid-orb liquid-orb-3" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="pt-20 pb-16 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 tag tag-mint mb-8"
            >
              <Zap className="w-4 h-4" />
              <span>快速 · 安全 · 纯前端</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="heading-display text-5xl md:text-7xl mb-6"
            >
              <span className="text-white">Utility</span>{" "}
              <span className="heading-glow">Tools</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            >
              一系列令人惊叹的实用工具集
              <br />
              <span className="text-white/40">所有处理均在本地完成，保护您的隐私安全</span>
            </motion.p>
          </div>
        </header>

        {/* Tag Filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="px-6 pb-8"
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleTagClick("全部")}
              className={`tag text-sm cursor-pointer transition-all ${
                selectedTags.length === 0
                  ? "tag-mint !bg-[#64ffda]/20 !border-[#64ffda]/50"
                  : "hover:border-white/30"
              }`}
            >
              全部
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`tag text-sm cursor-pointer transition-all ${
                  selectedTags.includes(tag)
                    ? "tag-mint !bg-[#64ffda]/20 !border-[#64ffda]/50"
                    : "hover:border-white/30"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </motion.div>

        <LayoutGroup>
          {/* Tools Grid */}
          <motion.main layout className="px-6 pb-20">
            <motion.div
              layout
              className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <AnimatePresence mode="popLayout">
                {filteredTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.main>

          {/* Footer */}
          <motion.footer layout className="pb-12 px-6">
            <div className="max-w-6xl mx-auto">
              <div className="glass-card p-6 text-center">
              {/* 统计数据展示 */}
              {stats && (
                <div className="flex items-center justify-center gap-6 mb-4 flex-wrap">
                  <div className="flex items-center gap-2 text-white/60">
                    <Eye className="w-4 h-4 text-[#64ffda]" />
                    <span className="text-sm">
                      访问量 <span className="text-white font-medium">{stats.totalVisits.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60">
                    <MousePointerClick className="w-4 h-4 text-[#ff6b9d]" />
                    <span className="text-sm">
                      工具使用{" "}
                      <span className="text-white font-medium">
                        {Object.values(stats.toolStats).reduce((a, b) => a + b, 0).toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>
              )}
              <p className="text-white/40 text-sm">
                所有工具均在浏览器本地运行，您的数据不会上传到任何服务器
              </p>
              <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                <span className="tag">
                  <Shield className="w-3.5 h-3.5" />
                  隐私安全
                </span>
                <span className="tag">
                  <Zap className="w-3.5 h-3.5" />
                  快速响应
                </span>
                <span className="tag">
                  <Clock className="w-3.5 h-3.5" />
                  免费使用
                </span>
              </div>
            </div>
            </div>
          </motion.footer>
        </LayoutGroup>
      </div>
    </div>
  );
}
