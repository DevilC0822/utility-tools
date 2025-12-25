"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Trash2,
  Upload,
  Shield,
  Image as ImageIcon,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";
import {
  type CompressOptions,
  type OutputFormat,
  OUTPUT_FORMATS,
  SUPPORTED_INPUT_TYPES,
  compressImage,
  isCanvasTypeSupported,
  isLossyType,
  resolveOutputType,
} from "@/lib/image-compress";
import { formatBytes } from "@/lib/format";
import { recordToolUsage } from "@/lib/stats";

type ItemStatus = "pending" | "processing" | "done" | "error";

type CompressItem = {
  id: string;
  file: File;
  fileName: string;
  status: ItemStatus;
  blocked?: boolean;
  error?: string;
  note?: string;
  originalUrl: string;
  outputUrl?: string;
  outputBlob?: Blob;
  outputType?: string;
  usedOriginal?: boolean;
  width?: number;
  height?: number;
  outputWidth?: number;
  outputHeight?: number;
  originalBytes: number;
  outputBytes?: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_LABEL = "10MB";

const QUALITY_MIN = 40;
const QUALITY_MAX = 95;
const QUALITY_HIGH_MIN = 80;
const QUANTIZE_MAX_PIXELS = 2000000;
const QUANTIZE_SAMPLE_SIZE = 120000;
const KEEP_ORIGINAL_IF_LARGER = true;

const QUANTIZE_OPTIONS = [
  { value: 256, label: "256 色" },
  { value: 128, label: "128 色" },
  { value: 64, label: "64 色" },
  { value: 32, label: "32 色" },
];

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getFileExtension = (mimeType: string | undefined): string => {
  if (!mimeType) return "jpg";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
};

const stripFileExtension = (name: string): string => name.replace(/\.[^/.]+$/, "");

const parseDimension = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 20000);
};

export default function ImageCompressPage() {
  const [items, setItems] = useState<CompressItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("auto");
  const [quality, setQuality] = useState(82);
  const [maxWidth, setMaxWidth] = useState("");
  const [maxHeight, setMaxHeight] = useState("");
  const [enableQuantization, setEnableQuantization] = useState(true);
  const [quantizeColors, setQuantizeColors] = useState(256);
  const [highQuality, setHighQuality] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<CompressItem[]>([]);
  const processingIdRef = useRef(0);
  const pendingTriggerRef = useRef(false);
  const processingRef = useRef(false);
  const [availableFormats, setAvailableFormats] = useState(OUTPUT_FORMATS);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      });
    };
  }, []);

  useEffect(() => {
    setAvailableFormats(
      OUTPUT_FORMATS.filter(
        (format) => format.value === "auto" || isCanvasTypeSupported(format.value)
      )
    );
  }, []);

  useEffect(() => {
    if (!availableFormats.some((format) => format.value === outputFormat)) {
      setOutputFormat("auto");
    }
  }, [availableFormats, outputFormat]);

  const options = useMemo<CompressOptions>(() => {
    const minQuality = highQuality ? QUALITY_HIGH_MIN : QUALITY_MIN;
    const safeQuality = Math.min(QUALITY_MAX, Math.max(minQuality, quality));
    return {
      outputFormat,
      quality: safeQuality / 100,
      maxWidth: parseDimension(maxWidth),
      maxHeight: parseDimension(maxHeight),
      backgroundColor: "#ffffff",
      enableQuantization,
      quantizeColors,
      quantizeMaxPixels: QUANTIZE_MAX_PIXELS,
      quantizeSampleSize: QUANTIZE_SAMPLE_SIZE,
      keepOriginalIfLarger: KEEP_ORIGINAL_IF_LARGER,
    };
  }, [outputFormat, quality, maxWidth, maxHeight, enableQuantization, quantizeColors, highQuality]);

  useEffect(() => {
    if (!highQuality) return;
    if (quality < QUALITY_HIGH_MIN) {
      setQuality(QUALITY_HIGH_MIN);
    }
  }, [highQuality, quality]);

  const updateItem = useCallback((id: string, updates: Partial<CompressItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.outputUrl && updates.outputUrl && item.outputUrl !== updates.outputUrl) {
          URL.revokeObjectURL(item.outputUrl);
        }
        return { ...item, ...updates };
      })
    );
  }, []);

  const startCompression = useCallback(async () => {
    if (processingRef.current) {
      pendingTriggerRef.current = true;
      return;
    }
    const runId = (processingIdRef.current += 1);
    processingRef.current = true;
    setIsProcessing(true);
    let hasSuccess = false;

    while (true) {
      if (runId !== processingIdRef.current) break;
      const next = itemsRef.current.find((item) => item.status === "pending");
      if (!next) break;

      updateItem(next.id, { status: "processing", error: undefined });
      try {
        const result = await compressImage(next.file, options);
        if (runId !== processingIdRef.current) {
          break;
        }
        const outputBlob = result.blob;
        const outputUrl = URL.createObjectURL(outputBlob);
        const outputType = result.outputType;
        updateItem(next.id, {
          status: "done",
          outputBlob,
          outputUrl,
          outputType,
          usedOriginal: result.usedOriginal,
          note: result.note,
          width: result.width,
          height: result.height,
          outputWidth: result.outputWidth,
          outputHeight: result.outputHeight,
          outputBytes: outputBlob.size,
        });
        hasSuccess = true;
      } catch (err) {
        if (runId !== processingIdRef.current) {
          break;
        }
        updateItem(next.id, {
          status: "error",
          error: err instanceof Error ? err.message : "压缩失败",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (runId === processingIdRef.current) {
      processingRef.current = false;
      setIsProcessing(false);
      if (hasSuccess) {
        recordToolUsage("image-compress");
      }
      if (pendingTriggerRef.current) {
        pendingTriggerRef.current = false;
        const hasPending = itemsRef.current.some((item) => item.status === "pending");
        if (hasPending) {
          startCompression();
        }
      }
    }
  }, [options, updateItem]);

  const addItems = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const nextItems: CompressItem[] = files.map((file) => {
      if (!SUPPORTED_INPUT_TYPES.includes(file.type)) {
        return {
          id: createId(),
          file,
          fileName: file.name,
          status: "error",
          blocked: true,
          error: "仅支持 JPEG、PNG、WebP、AVIF、BMP",
          originalUrl: URL.createObjectURL(file),
          originalBytes: file.size,
        };
      }
      if (file.size > MAX_FILE_BYTES) {
        return {
          id: createId(),
          file,
          fileName: file.name,
          status: "error",
          blocked: true,
          error: `单张图片超过 ${MAX_FILE_LABEL}`,
          originalUrl: URL.createObjectURL(file),
          originalBytes: file.size,
        };
      }
      return {
        id: createId(),
        file,
        fileName: file.name,
        status: "pending",
        originalUrl: URL.createObjectURL(file),
        originalBytes: file.size,
      };
    });

    setItems((prev) => [...nextItems, ...prev]);
    setTimeout(() => {
      startCompression();
    }, 0);
  }, [startCompression]);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        addItems(files);
      }
    },
    [addItems]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) {
        addItems(files);
      }
      event.target.value = "";
    },
    [addItems]
  );

  const handleClear = useCallback(() => {
    processingIdRef.current += 1;
    processingRef.current = false;
    itemsRef.current.forEach((item) => {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    });
    setItems([]);
    setIsProcessing(false);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.originalUrl) URL.revokeObjectURL(target.originalUrl);
      if (target?.outputUrl) URL.revokeObjectURL(target.outputUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleRecompress = useCallback(() => {
    processingIdRef.current += 1;
    processingRef.current = false;
    setIsProcessing(false);
    setItems((prev) =>
      prev.map((item) => {
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        return {
          ...item,
          status: item.blocked ? "error" : "pending",
          error: item.blocked ? item.error : undefined,
          outputUrl: undefined,
          outputBlob: undefined,
          outputBytes: undefined,
          outputType: undefined,
          outputWidth: undefined,
          outputHeight: undefined,
          usedOriginal: undefined,
          note: undefined,
        };
      })
    );
    setTimeout(() => startCompression(), 0);
  }, [startCompression]);

  const handleDownloadItem = useCallback((item: CompressItem) => {
    if (!item.outputBlob) return;
    const outputType = item.outputType ?? "image/jpeg";
    const extension = getFileExtension(outputType);
    const baseName = stripFileExtension(item.fileName);
    const url = URL.createObjectURL(item.outputBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}-compressed.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadAll = useCallback(() => {
    const completed = itemsRef.current.filter((item) => item.status === "done");
    if (completed.length === 0) return;
    completed.forEach((item, index) => {
      setTimeout(() => handleDownloadItem(item), index * 200);
    });
  }, [handleDownloadItem]);

  const summary = useMemo(() => {
    const doneItems = items.filter((item) => item.status === "done");
    const totalOriginal = doneItems.reduce((sum, item) => sum + item.originalBytes, 0);
    const totalOutput = doneItems.reduce((sum, item) => sum + (item.outputBytes ?? 0), 0);
    const savedBytes = Math.max(0, totalOriginal - totalOutput);
    const savedRatio = totalOriginal > 0 ? savedBytes / totalOriginal : 0;
    return {
      totalOriginal,
      totalOutput,
      savedBytes,
      savedRatio,
      doneCount: doneItems.length,
    };
  }, [items]);

  const hasCompleted = items.some((item) => item.status === "done");
  const hasPending = items.some((item) => item.status === "pending");

  return (
    <div className="min-h-screen relative">
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="liquid-orb liquid-orb-3" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-7xl">
        <header className="mb-10">
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
                <span className="text-white">图片 </span>
                <span className="heading-glow">压缩</span>
              </h1>
              <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
                智能压缩图片体积，支持批量处理与格式转换
                <br />
                <span className="text-white/40">
                  全程本地处理，不上传服务器
                </span>
              </p>
            </div>
          </motion.div>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-card p-6 mb-8"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <div className="text-xs text-white/50">输出格式</div>
              <select
                value={outputFormat}
                onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-[#64ffda]/40"
              >
                {availableFormats.map((format) => (
                  <option key={format.value} value={format.value} className="text-black">
                    {format.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-white/40">
                JPEG 不支持透明，会自动填充白色
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>质量</span>
                <span className="text-white/70">{quality}</span>
              </div>
              <input
                type="range"
                min={highQuality ? QUALITY_HIGH_MIN : QUALITY_MIN}
                max={QUALITY_MAX}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="w-full accent-[#64ffda]"
                disabled={outputFormat !== "auto" && !isLossyType(outputFormat)}
              />
              <p className="text-[11px] text-white/40">
                仅对 JPEG / WebP / AVIF 生效
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-white/50">最大宽度（像素）</div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="不限制"
                value={maxWidth}
                onChange={(event) => setMaxWidth(event.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-[#64ffda]/40"
              />
              <p className="text-[11px] text-white/40">保持比例缩放，仅缩小不放大</p>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-white/50">最大高度（像素）</div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="不限制"
                value={maxHeight}
                onChange={(event) => setMaxHeight(event.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-[#64ffda]/40"
              />
              <p className="text-[11px] text-white/40">建议与最大宽度配合使用</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-white/10">
            <button
              onClick={() => setEnableQuantization((prev) => !prev)}
              className={`tag text-xs cursor-pointer transition-all ${
                enableQuantization ? "tag-mint" : "hover:border-white/30"
              }`}
            >
              颜色量化（PNG）
            </button>
            <select
              value={quantizeColors}
              onChange={(event) => setQuantizeColors(Number(event.target.value))}
              className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/80 focus:outline-none focus:border-[#64ffda]/40"
              disabled={!enableQuantization}
              style={{ opacity: enableQuantization ? 1 : 0.5 }}
            >
              {QUANTIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="text-black">
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setHighQuality((prev) => !prev)}
              className={`tag text-xs cursor-pointer transition-all ${
                highQuality ? "tag-mint" : "hover:border-white/30"
              }`}
            >
              高质量编码
            </button>
            <span className="tag text-xs text-white/60">
              重新编码时清理元数据
            </span>
            <span className="tag text-xs text-white/60">
              变大则保留原图
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              onClick={handleRecompress}
              className="btn-liquid flex items-center gap-2"
              disabled={!hasCompleted && !hasPending}
              style={{ opacity: !hasCompleted && !hasPending ? 0.5 : 1 }}
            >
              <RefreshCw className="w-4 h-4" />
              <span>重新压缩</span>
            </button>
            <button
              onClick={handleDownloadAll}
              className="btn-liquid flex items-center gap-2"
              disabled={!hasCompleted || isProcessing}
              style={{ opacity: !hasCompleted || isProcessing ? 0.5 : 1 }}
            >
              <Download className="w-4 h-4" />
              <span>下载全部</span>
            </button>
            <button
              onClick={handleClear}
              className="btn-liquid flex items-center gap-2"
              disabled={items.length === 0}
              style={{ opacity: items.length === 0 ? 0.5 : 1 }}
            >
              <Trash2 className="w-4 h-4" />
              <span>清空</span>
            </button>
            {isProcessing && (
              <div className="flex items-center gap-2 text-white/60 text-sm ml-auto">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>处理中...</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={`glass-card p-8 mb-8 border border-dashed cursor-pointer ${
            dragActive ? "border-[#64ffda] bg-[#64ffda]/5" : "border-white/10"
          }`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDrop={handleDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
        >
          <div className="text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-white/10">
              <ImageIcon className="w-6 h-6 text-white/70" />
            </div>
            <p className="text-white/80">点击或拖拽图片到这里上传</p>
            <p className="text-white/40 text-sm mt-2">
              支持 JPEG、PNG、WebP、AVIF、BMP，单张 ≤ {MAX_FILE_LABEL}
            </p>
          </div>
        </motion.section>

        {summary.doneCount > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="glass-card p-6 mb-8"
          >
            <div className="grid gap-4 md:grid-cols-4 text-sm">
              <div className="text-white/60">
                已完成 <span className="text-white font-semibold">{summary.doneCount}</span> 张
              </div>
              <div className="text-white/60">
                原始体积 <span className="text-white font-semibold">{formatBytes(summary.totalOriginal)}</span>
              </div>
              <div className="text-white/60">
                压缩后 <span className="text-white font-semibold">{formatBytes(summary.totalOutput)}</span>
              </div>
              <div className="text-white/60">
                节省 <span className="text-[#64ffda] font-semibold">{formatBytes(summary.savedBytes)}</span>{" "}
                <span className="text-white/50">({Math.round(summary.savedRatio * 100)}%)</span>
              </div>
            </div>
          </motion.section>
        )}

        <AnimatePresence>
          {items.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {items.map((item) => {
                const outputType = item.outputType ?? resolveOutputType(item.file.type, outputFormat);
                const outputExtension = getFileExtension(outputType);
                const ratio = item.outputBytes
                  ? item.outputBytes / item.originalBytes
                  : null;

                return (
                  <div key={item.id} className="glass-card p-5">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
                        <img
                          src={item.originalUrl}
                          alt={item.fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-[240px]">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-white font-medium">{item.fileName}</h3>
                          {item.status === "done" && (
                            <span className="tag tag-mint text-xs">
                              <Check className="w-3 h-3" />
                              完成
                            </span>
                          )}
                          {item.usedOriginal && (
                            <span className="tag text-xs text-white/70">
                              保留原图
                            </span>
                          )}
                          {item.status === "processing" && (
                            <span className="tag text-xs text-white/70">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              处理中
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="tag tag-coral text-xs">
                              <AlertCircle className="w-3 h-3" />
                              失败
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
                          <span>原始 {formatBytes(item.originalBytes)}</span>
                          {item.outputBytes && (
                            <span>
                              压缩后 {formatBytes(item.outputBytes)} ·{" "}
                              <span
                                className={
                                  ratio && ratio < 1 ? "text-[#64ffda]" : "text-[#ff6b9d]"
                                }
                              >
                                {Math.round((ratio ?? 1) * 100)}%
                              </span>
                            </span>
                          )}
                          {item.width && item.height && (
                            <span>
                              {item.width}×{item.height}
                            </span>
                          )}
                          {item.outputWidth && item.outputHeight && (
                            <span>
                              → {item.outputWidth}×{item.outputHeight}
                            </span>
                          )}
                          <span>输出 {outputExtension.toUpperCase()}</span>
                        </div>

                        {item.error && (
                          <p className="text-xs text-[#ff6b9d] mt-2">{item.error}</p>
                        )}
                        {!item.error && item.note && (
                          <p className="text-xs text-white/50 mt-2">{item.note}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadItem(item)}
                          className="btn-liquid flex items-center gap-2"
                          disabled={item.status !== "done"}
                          style={{ opacity: item.status !== "done" ? 0.5 : 1 }}
                        >
                          <Download className="w-4 h-4" />
                          下载
                        </button>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="btn-liquid flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          移除
                        </button>
                      </div>
                    </div>

                    {item.outputUrl && (
                      <div className="mt-4 rounded-xl overflow-hidden bg-white/5">
                        <img
                          src={item.outputUrl}
                          alt={`${item.fileName} 压缩后`}
                          className="w-full max-h-[240px] object-contain"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}
