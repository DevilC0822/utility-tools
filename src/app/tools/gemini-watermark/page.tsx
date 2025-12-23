"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Upload,
  Download,
  RefreshCw,
  Clock,
  Trash2,
  X,
  Check,
  ArrowLeft,
  Shield,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { processImage, getWatermarkConfig } from "@/lib/watermark-remover";
import { recordToolUsage } from "@/lib/stats";
import {
  type HistoryRecord,
  getHistory,
  addHistory,
  deleteHistory,
  clearHistory,
  formatTime,
} from "@/lib/history-storage";

type ProcessingState = "idle" | "processing" | "done" | "error";

export default function GeminiWatermarkPage() {
  const [state, setState] = useState<ProcessingState>("idle");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [imageInfo, setImageInfo] = useState<{
    width: number;
    height: number;
    watermarkSize: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<HistoryRecord | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    title: string;
    fileName: string;
    isProcessed: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载历史记录
  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }

    setState("processing");
    setError(null);
    setFileName(file.name);

    try {
      const result = await processImage(file);
      setOriginalImage(result.original);
      setProcessedImage(result.processed);
      setProcessedBlob(result.blob);

      const img = new Image();
      img.onload = async () => {
        const config = getWatermarkConfig(img.width, img.height);
        const info = {
          width: img.width,
          height: img.height,
          watermarkSize: config.size,
        };
        setImageInfo(info);

        // 保存到历史记录
        await addHistory({
          fileName: file.name,
          originalImage: result.original,
          processedImage: result.processed,
          width: info.width,
          height: info.height,
          watermarkSize: info.watermarkSize,
        });
        getHistory().then(setHistory);
      };
      img.src = result.original;

      setState("done");
      // 处理成功后记录工具使用
      recordToolUsage("gemini-watermark");
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败");
      setState("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDownload = useCallback(() => {
    if (!processedBlob) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = fileName.replace(/\.[^.]+$/, "");
    a.download = `${baseName}_no_watermark.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [processedBlob, fileName]);

  const handleReset = useCallback(() => {
    setState("idle");
    setOriginalImage(null);
    setProcessedImage(null);
    setProcessedBlob(null);
    setError(null);
    setFileName("");
    setImageInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleDeleteRecord = useCallback(async (id: string) => {
    await deleteHistory(id);
    getHistory().then(setHistory);
  }, []);

  const handleClearHistory = useCallback(async () => {
    if (!confirm("确定要清空所有历史记录吗？")) return;
    await clearHistory();
    setHistory([]);
    setShowHistory(false);
  }, []);

  return (
    <div className="min-h-screen relative">
      {/* Liquid Background */}
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="liquid-orb liquid-orb-3" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <header className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回工具列表</span>
            </Link>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 tag tag-mint mb-6">
                <Shield className="w-4 h-4" />
                <span>隐私安全 · 纯前端处理</span>
              </div>
              <h1 className="heading-display text-4xl md:text-5xl mb-4">
                <span className="text-white">Gemini </span>
                <span className="heading-glow">水印移除</span>
              </h1>
              <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
                使用反向 Alpha 混合算法精确还原原始像素
                <br />
                <span className="text-white/40">图片不会上传到服务器，完全在本地处理</span>
              </p>

              {/* 历史记录按钮 */}
              {history.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="mt-6 inline-flex items-center gap-2 tag hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  <span>历史记录 ({history.length})</span>
                </button>
              )}
            </div>
          </motion.div>
        </header>

        {/* 历史记录面板 */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-card p-6 mb-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="heading-display text-lg text-white">转换历史</h2>
                {history.length >= 2 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    清空全部
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className="group relative rounded-xl overflow-hidden cursor-pointer transition-transform hover:scale-105"
                    style={{ background: "rgba(0,0,0,0.3)" }}
                    onClick={() => setPreviewRecord(record)}
                  >
                    <img
                      src={record.processedImage}
                      alt={record.fileName}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs text-white truncate">{record.fileName}</p>
                        <p className="text-xs text-white/50">{formatTime(record.createdAt)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRecord(record.id);
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-[#ff6b9d]/80 hover:bg-[#ff6b9d]"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 历史记录预览弹窗 */}
        <AnimatePresence>
          {previewRecord && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "rgba(15, 12, 41, 0.9)" }}
              onClick={() => setPreviewRecord(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="glass-card p-6 max-w-4xl w-full max-h-[90vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="heading-display text-lg text-white">
                      {previewRecord.fileName}
                    </h3>
                    <p className="text-sm text-white/50">
                      {previewRecord.width} × {previewRecord.height} · {formatTime(previewRecord.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => setPreviewRecord(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="glass-card p-4">
                    <span className="tag text-xs mb-3 inline-block">原图</span>
                    <img
                      src={previewRecord.originalImage}
                      alt="原图"
                      className="w-full rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewImage({
                        src: previewRecord.originalImage,
                        title: "原图",
                        fileName: previewRecord.fileName,
                        isProcessed: false,
                      })}
                    />
                  </div>
                  <div className="glass-card p-4" style={{ borderColor: "rgba(100, 255, 218, 0.3)" }}>
                    <span className="tag tag-mint text-xs mb-3 inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      已移除水印
                    </span>
                    <img
                      src={previewRecord.processedImage}
                      alt="处理后"
                      className="w-full rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewImage({
                        src: previewRecord.processedImage,
                        title: "已移除水印",
                        fileName: previewRecord.fileName,
                        isProcessed: true,
                      })}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 图片大图预览弹窗 */}
        <AnimatePresence>
          {previewImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "rgba(15, 12, 41, 0.95)" }}
              onClick={() => setPreviewImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute -top-12 left-0 right-0 flex items-center justify-between">
                  <span className="tag text-sm">{previewImage.title}</span>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </button>
                </div>
                <img
                  src={previewImage.src}
                  alt={previewImage.title}
                  className="max-w-full max-h-[80vh] rounded-xl object-contain"
                />
                <button
                  onClick={() => {
                    const baseName = previewImage.fileName.replace(/\.[^.]+$/, "");
                    const suffix = previewImage.isProcessed ? "no_watermark" : "watermarked";
                    const a = document.createElement("a");
                    a.href = previewImage.src;
                    a.download = `${baseName}-${suffix}.png`;
                    a.click();
                  }}
                  className="mt-4 btn-liquid btn-primary flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  下载图片
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 主内容区 */}
        <main>
          {/* 上传区域 */}
          {state === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`glass-card p-16 text-center cursor-pointer transition-all ${
                dragActive ? "border-[#64ffda] bg-[#64ffda]/5" : ""
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="space-y-6">
                <div className="relative w-24 h-24 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-[#64ffda]/10" />
                  <div className="absolute inset-2 rounded-full bg-[#64ffda]/5" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Upload className="w-10 h-10 text-[#64ffda]" />
                  </div>
                </div>

                <div>
                  <p className="heading-display text-2xl text-white mb-2">
                    拖放图片到这里
                  </p>
                  <p className="text-white/50">或点击选择文件</p>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <span className="tag text-xs">JPG</span>
                  <span className="tag text-xs">PNG</span>
                  <span className="tag text-xs">WebP</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* 处理中 */}
          {state === "processing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-16 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-full border-2 border-[#64ffda]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#64ffda] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-[#64ffda]" />
                </div>
              </div>
              <p className="heading-display text-xl text-white">正在处理...</p>
              <p className="text-white/50 mt-2">使用反向 Alpha 混合算法移除水印</p>
            </motion.div>
          )}

          {/* 错误状态 */}
          {state === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-16 text-center"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center bg-[#ff6b9d]/15">
                <X className="w-10 h-10 text-[#ff6b9d]" />
              </div>
              <p className="text-xl mb-2 text-[#ff6b9d]">处理失败</p>
              <p className="text-white/60 mb-8">{error}</p>
              <button onClick={handleReset} className="btn-liquid">
                重新上传
              </button>
            </motion.div>
          )}

          {/* 处理完成 */}
          {state === "done" && originalImage && processedImage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* 图像信息标签 */}
              {imageInfo && (
                <div className="flex justify-center gap-3 flex-wrap">
                  <span className="tag">
                    <ImageIcon className="w-4 h-4" />
                    {imageInfo.width} × {imageInfo.height}
                  </span>
                  <span className="tag tag-mint">
                    <Check className="w-4 h-4" />
                    检测到 {imageInfo.watermarkSize}×{imageInfo.watermarkSize} 水印
                  </span>
                </div>
              )}

              {/* 对比图 */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* 原图 */}
                <div className="glass-card p-5">
                  <span className="tag text-xs mb-4 inline-block">原图</span>
                  <img
                    src={originalImage}
                    alt="原图"
                    className="w-full rounded-xl cursor-zoom-in hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewImage({
                      src: originalImage,
                      title: "原图",
                      fileName,
                      isProcessed: false,
                    })}
                  />
                </div>

                {/* 处理后 */}
                <div className="glass-card p-5" style={{ borderColor: "rgba(100, 255, 218, 0.3)" }}>
                  <span className="tag tag-mint text-xs mb-4 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    已移除水印
                  </span>
                  <img
                    src={processedImage}
                    alt="处理后"
                    className="w-full rounded-xl cursor-zoom-in hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewImage({
                      src: processedImage,
                      title: "已移除水印",
                      fileName,
                      isProcessed: true,
                    })}
                  />
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-center gap-4 flex-wrap">
                <button onClick={handleDownload} className="btn-liquid btn-primary flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  下载处理后的图片
                </button>
                <button onClick={handleReset} className="btn-liquid flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  处理其他图片
                </button>
              </div>
            </motion.div>
          )}
        </main>

        {/* 页脚 */}
        <footer className="mt-16 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="glass-card inline-block px-6 py-4"
          >
            <p className="text-white/40 text-sm">
              基于{" "}
              <a
                href="https://github.com/allenk/GeminiWatermarkTool"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#64ffda]/80 hover:text-[#64ffda] transition-colors"
              >
                GeminiWatermarkTool
              </a>{" "}
              的算法实现
            </p>
            <p className="text-white/30 text-xs mt-2 font-mono">
              original = (watermarked - α × 255) / (1 - α)
            </p>
          </motion.div>
        </footer>
      </div>
    </div>
  );
}
