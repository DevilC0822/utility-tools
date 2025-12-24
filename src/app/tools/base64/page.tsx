"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Trash2,
  Upload,
  Download,
  Shield,
  Code2,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  WrapText,
  AlertCircle,
} from "lucide-react";
import {
  encodeText,
  fileToBase64,
  base64ToBlob,
  decodeBase64ToBytes,
  detectImageMimeType,
  estimateBase64Bytes,
  parseDataUri,
  formatBase64,
  formatBytes,
} from "@/lib/base64";
import { recordToolUsage } from "@/lib/stats";

type Mode = "encode" | "decode";
type OutputKind = "text" | "image" | "binary";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_LABEL = "10MB";
const getSizeLimitMessage = (size: number): string =>
  `文件大小超过 ${MAX_FILE_LABEL}（${formatBytes(size)}），已停止处理`;

type ScheduledHandle = {
  kind: "idle" | "timeout";
  id: number;
};

const scheduleWork = (work: () => void): ScheduledHandle | null => {
  if (typeof window === "undefined") {
    work();
    return null;
  }
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(() => work(), { timeout: 200 });
    return { kind: "idle", id };
  }
  const id = window.setTimeout(work, 0);
  return { kind: "timeout", id };
};

const cancelScheduledWork = (handle: ScheduledHandle | null): void => {
  if (!handle || typeof window === "undefined") return;
  if (handle.kind === "idle" && "cancelIdleCallback" in window) {
    window.cancelIdleCallback(handle.id);
    return;
  }
  window.clearTimeout(handle.id);
};

const toUrlSafeBase64 = (base64: string): string =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const isTextMimeType = (mimeType: string | null): boolean => {
  if (!mimeType) return false;
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript" ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
};

const decodeBytesToText = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

// 简单启发式：含大量控制字符则视为二进制
const isLikelyText = (bytes: Uint8Array): boolean => {
  if (bytes.length === 0) return true;
  let controlCount = 0;
  for (const value of bytes) {
    if (value === 0x00) return false;
    if (value < 0x09 || (value > 0x0d && value < 0x20) || value === 0x7f) {
      controlCount += 1;
    }
  }
  return controlCount / bytes.length < 0.05;
};

const getFileExtension = (mimeType: string | null): string => {
  if (!mimeType) return "bin";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/xml") return "xml";
  if (mimeType === "application/javascript") return "js";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/css") return "css";
  return "bin";
};

export default function Base64Page() {
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [formatOutput, setFormatOutput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"left" | "right" | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inputMimeType, setInputMimeType] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string | null>(null);
  const [outputKind, setOutputKind] = useState<OutputKind | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<{
    inputLabel: string;
    inputBytes: number;
    outputLabel: string;
    outputBytes: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const leftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const processingIdRef = useRef(0);
  const scheduledWorkRef = useRef<ScheduledHandle | null>(null);
  const loadingTimerRef = useRef<number | null>(null);

  // 获取文件类型的友好名称
  const getFileTypeName = (mimeType: string | null): string => {
    if (!mimeType) return "文件";
    if (mimeType.startsWith("image/")) return "图片";
    if (isTextMimeType(mimeType)) return "文本文件";
    return "二进制文件";
  };

  // 实时转换
  useEffect(() => {
    const processId = (processingIdRef.current += 1);
    if (scheduledWorkRef.current) {
      cancelScheduledWork(scheduledWorkRef.current);
      scheduledWorkRef.current = null;
    }
    if (loadingTimerRef.current !== null) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    loadingTimerRef.current = window.setTimeout(() => {
      if (processId === processingIdRef.current) {
        setIsProcessing(true);
      }
    }, 150);

    const runConversion = () => {
      if (processId !== processingIdRef.current) return;
      try {
        if (mode === "encode") {
          setOutputKind("text");
          setOutputMimeType(null);
          setImagePreview(null);
          setInputMimeType(null);

          // 处理 Data URI 格式（如上传的文件）
          const parsed = parseDataUri(leftText);
          if (parsed) {
            const pureBase64 = parsed.base64;
            const mimeType = parsed.mimeType;
            const estimatedBytes = estimateBase64Bytes(pureBase64, false);
            if (estimatedBytes > MAX_FILE_BYTES) {
              setError(getSizeLimitMessage(estimatedBytes));
              setRightText("");
              setImagePreview(null);
              setOutputKind(null);
              setOutputMimeType(null);
              setInputMimeType(mimeType);
              setStats({
                inputLabel: `${getFileTypeName(mimeType)} ${formatBytes(estimatedBytes)}`,
                inputBytes: estimatedBytes,
                outputLabel: "已阻止",
                outputBytes: 0,
              });
              return;
            }
            const outputBase64 = urlSafe ? toUrlSafeBase64(pureBase64) : pureBase64;
            const displayOutput = formatOutput ? formatBase64(outputBase64) : outputBase64;
            const outputLength = displayOutput.length;

            setRightText(displayOutput);
            setError(null);
            setInputMimeType(mimeType);
            setStats({
              inputLabel: mimeType.startsWith("image/") ? "原始图片" : "原始文件",
              inputBytes: estimatedBytes,
              outputLabel: `${outputLength} 字符`,
              outputBytes: outputLength,
            });
            return;
          }

          // 普通文本编码
          const result = encodeText(leftText, urlSafe);
          if (result.success) {
            const rawOutput = result.data;
            const displayOutput =
              formatOutput && rawOutput ? formatBase64(rawOutput) : rawOutput;
            const outputLength = displayOutput.length;
            setRightText(displayOutput);
            setError(null);
            setInputMimeType(null);
            if (result.stats) {
              setStats({
                inputLabel: `${leftText.length} 字符`,
                inputBytes: result.stats.inputBytes,
                outputLabel: `${outputLength} 字符`,
                outputBytes: outputLength,
              });
            } else {
              setStats(null);
            }
          } else {
            setError(result.error ?? "编码失败");
          }
        } else {
          setInputMimeType(null);

          // 解码模式：移除格式化换行
          const cleanInput = leftText.trim().replace(/\s/g, "");
          if (!cleanInput) {
            setRightText("");
            setError(null);
            setImagePreview(null);
            setOutputKind(null);
            setOutputMimeType(null);
            setStats(null);
            return;
          }

          // 处理 Data URI 格式
          const parsed = parseDataUri(cleanInput);
          if (parsed) {
            const estimatedBytes = estimateBase64Bytes(parsed.base64, urlSafe);
            if (estimatedBytes > MAX_FILE_BYTES) {
              setError(getSizeLimitMessage(estimatedBytes));
              setRightText("");
              setImagePreview(null);
              setOutputKind(null);
              setOutputMimeType(parsed.mimeType);
              setStats({
                inputLabel: "文件大小",
                inputBytes: estimatedBytes,
                outputLabel: "已阻止",
                outputBytes: 0,
              });
              return;
            }

            const decoded = decodeBase64ToBytes(parsed.base64, urlSafe);
            if (!decoded.success) {
              setError(decoded.error ?? "解码失败");
              setRightText("");
              setImagePreview(null);
              setOutputKind(null);
              setOutputMimeType(null);
              setStats(null);
              return;
            }

            const bytes = decoded.bytes;
            const imageMime =
              parsed.mimeType.startsWith("image/") ? parsed.mimeType : detectImageMimeType(bytes);
            setError(null);

            if (imageMime) {
              setRightText("");
              setImagePreview(`data:${imageMime};base64,${decoded.normalized}`);
              setOutputKind("image");
              setOutputMimeType(imageMime);
              setStats({
                inputLabel: `Data URI ${cleanInput.length} 字符`,
                inputBytes: cleanInput.length,
                outputLabel: "图片",
                outputBytes: bytes.length,
              });
              return;
            }

            if (isTextMimeType(parsed.mimeType)) {
              const text = decodeBytesToText(bytes);
              if (text !== null) {
                setRightText(text);
                setImagePreview(null);
                setOutputKind("text");
                setOutputMimeType(parsed.mimeType);
                setStats({
                  inputLabel: `Data URI ${cleanInput.length} 字符`,
                  inputBytes: cleanInput.length,
                  outputLabel: `${text.length} 字符`,
                  outputBytes: bytes.length,
                });
                return;
              }
            }

            setRightText("");
            setImagePreview(null);
            setOutputKind("binary");
            setOutputMimeType(parsed.mimeType);
            setStats({
              inputLabel: `Data URI ${cleanInput.length} 字符`,
              inputBytes: cleanInput.length,
              outputLabel: getFileTypeName(parsed.mimeType),
              outputBytes: bytes.length,
            });
            return;
          }

          const decoded = decodeBase64ToBytes(cleanInput, urlSafe);
          if (!decoded.success) {
            setError(decoded.error ?? "解码失败");
            setRightText("");
            setImagePreview(null);
            setOutputKind(null);
            setOutputMimeType(null);
            setStats(null);
            return;
          }

          const bytes = decoded.bytes;
          const imageMime = detectImageMimeType(bytes);
          setError(null);

          if (imageMime) {
            setRightText("");
            setImagePreview(`data:${imageMime};base64,${decoded.normalized}`);
            setOutputKind("image");
            setOutputMimeType(imageMime);
            setStats({
              inputLabel: `Base64 ${cleanInput.length} 字符`,
              inputBytes: cleanInput.length,
              outputLabel: "图片",
              outputBytes: bytes.length,
            });
            return;
          }

          if (isLikelyText(bytes)) {
            const text = decodeBytesToText(bytes);
            if (text !== null) {
              setRightText(text);
              setImagePreview(null);
              setOutputKind("text");
              setOutputMimeType("text/plain");
              setStats({
                inputLabel: `Base64 ${cleanInput.length} 字符`,
                inputBytes: cleanInput.length,
                outputLabel: `${text.length} 字符`,
                outputBytes: bytes.length,
              });
              return;
            }
          }

          setRightText("");
          setImagePreview(null);
          setOutputKind("binary");
          setOutputMimeType("application/octet-stream");
          setStats({
            inputLabel: `Base64 ${cleanInput.length} 字符`,
            inputBytes: cleanInput.length,
            outputLabel: "二进制文件",
            outputBytes: bytes.length,
          });
        }
      } finally {
        if (processId === processingIdRef.current) {
          setIsProcessing(false);
        }
        if (loadingTimerRef.current !== null) {
          window.clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }
      }
    };

    scheduledWorkRef.current = scheduleWork(runConversion);

    return () => {
      cancelScheduledWork(scheduledWorkRef.current);
      scheduledWorkRef.current = null;
    };
  }, [leftText, mode, urlSafe, formatOutput]);

  // 复制到剪贴板
  const handleCopy = useCallback(async (side: "left" | "right") => {
    const text = side === "left" ? leftText : rightText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(side);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // 忽略复制失败
    }
  }, [leftText, rightText]);

  // 清空
  const handleClear = useCallback(() => {
    processingIdRef.current += 1;
    cancelScheduledWork(scheduledWorkRef.current);
    scheduledWorkRef.current = null;
    if (loadingTimerRef.current !== null) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setLeftText("");
    setRightText("");
    setError(null);
    setImagePreview(null);
    setInputMimeType(null);
    setOutputMimeType(null);
    setOutputKind(null);
    setStats(null);
    setIsProcessing(false);
    leftTextareaRef.current?.focus();
  }, []);

  // 文件处理
  const handleFile = useCallback(async (file: File) => {
    setMode("encode");
    setIsProcessing(true);
    if (file.size > MAX_FILE_BYTES) {
      setError(getSizeLimitMessage(file.size));
      setLeftText("");
      setRightText("");
      setImagePreview(null);
      setInputMimeType(file.type || null);
      setOutputMimeType(null);
      setOutputKind(null);
      setStats({
        inputLabel: `${getFileTypeName(file.type || null)} ${formatBytes(file.size)}`,
        inputBytes: file.size,
        outputLabel: "已阻止",
        outputBytes: 0,
      });
      setIsProcessing(false);
      return;
    }
    const result = await fileToBase64(file);
    if (result.success) {
      setLeftText(result.data);
      recordToolUsage("base64");
    } else {
      setError(result.error ?? "文件处理失败");
      setIsProcessing(false);
    }
  }, [getFileTypeName]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  // 下载解码结果
  const handleDownload = useCallback(() => {
    if (error || isProcessing) return;
    const cleanInput = leftText.trim().replace(/\s/g, "");
    const isBinaryOutput = mode === "decode" && (outputKind === "image" || outputKind === "binary");

    if (isBinaryOutput) {
      const mimeType = outputMimeType ?? "application/octet-stream";
      const blob = base64ToBlob(cleanInput, mimeType, urlSafe);
      if (!blob) return;
      const ext = getFileExtension(mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decoded.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (!rightText) return;
    const textMimeType =
      mode === "decode" && outputMimeType && isTextMimeType(outputMimeType)
        ? outputMimeType
        : "text/plain";
    const ext = mode === "decode" ? getFileExtension(textMimeType) : "txt";
    const url = URL.createObjectURL(new Blob([rightText], { type: textMimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "encode" ? "encoded.txt" : `decoded.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [error, isProcessing, leftText, mode, outputKind, outputMimeType, rightText, urlSafe]);

  const hasOutput = !!rightText || outputKind === "image" || outputKind === "binary";
  const canDownload =
    !error && !isProcessing && (rightText || outputKind === "image" || outputKind === "binary");

  return (
    <div className="min-h-screen relative">
      {/* Liquid Background */}
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="liquid-orb liquid-orb-3" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-12 max-w-7xl">
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
                <span className="text-white">Base64 </span>
                <span className="heading-glow">编解码</span>
              </h1>
              <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
                快速进行 Base64 编码解码，支持文本和文件
                <br />
                <span className="text-white/40">所有处理均在浏览器本地完成</span>
              </p>
            </div>
          </motion.div>
        </header>

        {/* 选项栏 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap items-center justify-center gap-4 mb-8"
        >
          <button
            onClick={() => setUrlSafe(!urlSafe)}
            className={`tag text-sm cursor-pointer transition-all ${
              urlSafe ? "tag-mint" : "hover:border-white/30"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            URL Safe
          </button>
          <button
            onClick={() => setFormatOutput(!formatOutput)}
            className={`tag text-sm cursor-pointer transition-all ${
              formatOutput ? "tag-mint" : "hover:border-white/30"
            }`}
            disabled={mode !== "encode"}
            style={{ opacity: mode !== "encode" ? 0.5 : 1 }}
          >
            <WrapText className="w-3.5 h-3.5" />
            格式化输出
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="tag text-sm cursor-pointer transition-all hover:border-white/30"
          >
            <Upload className="w-3.5 h-3.5" />
            上传文件（≤10MB）
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </motion.div>

        {/* 操作按钮栏 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center gap-3 mb-6 relative z-20"
        >
          <button
            onClick={() => {
              setMode("encode");
              recordToolUsage("base64");
            }}
            className={`btn-liquid flex items-center gap-2 ${
              mode === "encode" ? "btn-primary" : ""
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            <span>编码</span>
          </button>
          <button
            onClick={() => {
              setMode("decode");
              recordToolUsage("base64");
            }}
            className={`btn-liquid flex items-center gap-2 ${
              mode === "decode" ? "btn-primary" : ""
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>解码</span>
          </button>
          <button
            onClick={handleClear}
            className="btn-liquid flex items-center gap-2"
            title="清空"
          >
            <Trash2 className="w-4 h-4" />
            <span>清空</span>
          </button>
        </motion.div>

        {/* 主编辑区 - 左右布局 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid lg:grid-cols-2 gap-4 lg:gap-6 mb-8 relative z-10"
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
        >
          {/* 左侧输入区 */}
          <div
            className={`glass-card p-5 flex flex-col transition-all ${
              dragActive ? "border-[#64ffda] bg-[#64ffda]/5" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="tag text-xs">
                  {mode === "encode" ? (
                    inputMimeType?.startsWith("image/") ? (
                      <>
                        <ImageIcon className="w-3.5 h-3.5" />
                        源图片
                      </>
                    ) : inputMimeType ? (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        源文件
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        原始文本
                      </>
                    )
                  ) : (
                    <>
                      <Code2 className="w-3.5 h-3.5" />
                      Base64
                    </>
                  )}
                </span>
                {stats && (
                  <span className="text-xs text-white/40">
                    {stats.inputLabel} · {formatBytes(stats.inputBytes)}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleCopy("left")}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                title="复制"
              >
                {copied === "left" ? (
                  <Check className="w-4 h-4 text-[#64ffda]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            {mode === "encode" && inputMimeType?.startsWith("image/") && leftText.startsWith("data:") ? (
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <img
                  src={leftText}
                  alt="源图片"
                  className="max-w-full max-h-[280px] rounded-lg object-contain"
                />
              </div>
            ) : (
              <textarea
                ref={leftTextareaRef}
                value={leftText}
                onChange={(e) => setLeftText(e.target.value)}
                placeholder={
                  mode === "encode"
                    ? "输入要编码的文本..."
                    : "输入 Base64 字符串或拖放文件（≤10MB）到此处..."
                }
                className="flex-1 min-h-[300px] bg-transparent border-none outline-none resize-none text-white/90 placeholder:text-white/30 font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
            )}
          </div>

          {/* 右侧输出区 */}
          <div className="glass-card p-5 flex flex-col relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className={`tag text-xs ${
                    error ? "tag-coral" : hasOutput ? "tag-mint" : ""
                  }`}
                >
                  {error ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      错误
                    </>
                  ) : mode === "encode" ? (
                    <>
                      <Code2 className="w-3.5 h-3.5" />
                      Base64
                    </>
                  ) : outputKind === "image" ? (
                    <>
                      <ImageIcon className="w-3.5 h-3.5" />
                      解码结果 · 图片
                    </>
                  ) : outputKind === "binary" ? (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      解码结果 · {getFileTypeName(outputMimeType)}
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      解码结果 · 文本
                    </>
                  )}
                </span>
                {stats && !error && (
                  <span className="text-xs text-white/40">
                    {stats.outputLabel} · {formatBytes(stats.outputBytes)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy("right")}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  title="复制"
                  disabled={!rightText || !!error || isProcessing}
                >
                  {copied === "right" ? (
                    <Check className="w-4 h-4 text-[#64ffda]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  title="下载"
                  disabled={!canDownload}
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error ? (
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-[#ff6b9d]/15">
                    <AlertCircle className="w-8 h-8 text-[#ff6b9d]" />
                  </div>
                  <p className="text-[#ff6b9d]">{error}</p>
                </div>
              </div>
            ) : outputKind === "image" && imagePreview ? (
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <img
                  src={imagePreview}
                  alt="预览"
                  className="max-w-full max-h-[280px] rounded-lg object-contain"
                />
              </div>
            ) : outputKind === "binary" ? (
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-white/10">
                    <FileText className="w-8 h-8 text-white/60" />
                  </div>
                  <p className="text-white/70">
                    已识别为{getFileTypeName(outputMimeType)}
                  </p>
                  {outputMimeType && (
                    <p className="text-white/40 text-xs mt-2 font-mono">
                      {outputMimeType}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <textarea
                value={rightText}
                readOnly
                placeholder="转换结果将显示在这里..."
                className="flex-1 min-h-[300px] bg-transparent border-none outline-none resize-none text-white/90 placeholder:text-white/30 font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
            )}

            {isProcessing && (
              <div className="absolute inset-0 rounded-2xl bg-black/35 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-[#64ffda] animate-spin" />
                  <p className="text-white/80 text-sm">处理中...</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* 页脚说明 */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <div className="glass-card inline-block px-6 py-4">
            <p className="text-white/40 text-sm">
              Base64 是一种将二进制数据编码为 ASCII 字符串的方法
            </p>
            <p className="text-white/30 text-xs mt-2 font-mono">
              编码比率约 4:3（每 3 字节转为 4 个字符）
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
