"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure,
} from "@heroui/react";
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
type BatchStatus = "pending" | "processing" | "done" | "error";

type BatchItem = {
  id: string;
  fileName: string;
  status: BatchStatus;
  error?: string;
  record?: HistoryRecord;
};

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
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
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

  // HeroUI Modal 控制
  const {
    isOpen: isPreviewRecordOpen,
    onOpen: onPreviewRecordOpen,
    onOpenChange: onPreviewRecordOpenChange,
  } = useDisclosure();
  const {
    isOpen: isPreviewImageOpen,
    onOpen: onPreviewImageOpen,
    onOpenChange: onPreviewImageOpenChange,
  } = useDisclosure();
  const {
    isOpen: isClearConfirmOpen,
    onOpen: onClearConfirmOpen,
    onOpenChange: onClearConfirmOpenChange,
  } = useDisclosure();

  // 加载历史记录
  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  const resolveImageInfo = useCallback((dataUrl: string) => {
    return new Promise<{ width: number; height: number; watermarkSize: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const config = getWatermarkConfig(img.width, img.height);
          resolve({
            width: img.width,
            height: img.height,
            watermarkSize: config.size,
          });
        };
        img.onerror = () => reject(new Error("加载图像失败"));
        img.src = dataUrl;
      }
    );
  }, []);

  const updateBatchItem = useCallback((id: string, updates: Partial<BatchItem>) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const handleSingleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("请上传图片文件");
        setState("error");
        return;
      }

      setBatchItems([]);
      setState("processing");
      setError(null);
      setFileName(file.name);

      try {
        const result = await processImage(file);
        setOriginalImage(result.original);
        setProcessedImage(result.processed);
        setProcessedBlob(result.blob);

        const info = await resolveImageInfo(result.original);
        setImageInfo(info);

        await addHistory({
          fileName: file.name,
          originalImage: result.original,
          processedImage: result.processed,
          width: info.width,
          height: info.height,
          watermarkSize: info.watermarkSize,
        });
        getHistory().then(setHistory);

        setState("done");
        // 处理成功后记录工具使用
        recordToolUsage("gemini-watermark");
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败");
        setState("error");
      }
    },
    [resolveImageInfo]
  );

  const handleBatchFiles = useCallback(
    async (files: File[]) => {
      const batchId = Date.now();
      const initialItems = files.map((file, index) => ({
        id: `${batchId}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        status: "pending" as BatchStatus,
      }));

      setBatchItems(initialItems);
      setState("processing");
      setError(null);
      setOriginalImage(null);
      setProcessedImage(null);
      setProcessedBlob(null);
      setFileName("");
      setImageInfo(null);

      let hasSuccess = false;

      for (const [index, file] of files.entries()) {
        const itemId = initialItems[index].id;
        updateBatchItem(itemId, { status: "processing" });

        try {
          const result = await processImage(file);
          const info = await resolveImageInfo(result.original);
          const record = await addHistory({
            fileName: file.name,
            originalImage: result.original,
            processedImage: result.processed,
            width: info.width,
            height: info.height,
            watermarkSize: info.watermarkSize,
          });

          updateBatchItem(itemId, { status: "done", record });
          hasSuccess = true;
        } catch (err) {
          updateBatchItem(itemId, {
            status: "error",
            error: err instanceof Error ? err.message : "处理失败",
          });
        }
      }

      getHistory().then(setHistory);
      setState("done");
      if (hasSuccess) {
        recordToolUsage("gemini-watermark");
      }
    },
    [resolveImageInfo, updateBatchItem]
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        setError("请上传图片文件");
        setState("error");
        return;
      }
      if (imageFiles.length === 1) {
        void handleSingleFile(imageFiles[0]);
        return;
      }
      void handleBatchFiles(imageFiles);
    },
    [handleBatchFiles, handleSingleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
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
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
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

  const handleDownloadRecord = useCallback((record: HistoryRecord) => {
    const baseName = record.fileName.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = record.processedImage;
    a.download = `${baseName}_no_watermark.png`;
    a.click();
  }, []);

  const handleReset = useCallback(() => {
    setState("idle");
    setOriginalImage(null);
    setProcessedImage(null);
    setProcessedBlob(null);
    setError(null);
    setFileName("");
    setImageInfo(null);
    setBatchItems([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleDeleteRecord = useCallback(async (id: string) => {
    await deleteHistory(id);
    getHistory().then(setHistory);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
    setShowHistory(false);
  }, []);

  const isBatchMode = batchItems.length > 0;
  const batchTotal = batchItems.length;
  const batchCompleted = batchItems.filter(
    (item) => item.status === "done" || item.status === "error"
  ).length;
  const batchSuccess = batchItems.filter((item) => item.status === "done").length;
  const batchFailed = batchItems.filter((item) => item.status === "error").length;
  const batchCurrent = batchItems.find((item) => item.status === "processing")?.fileName;

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
                    onClick={onClearConfirmOpen}
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
                    onClick={() => {
                      setPreviewRecord(record);
                      onPreviewRecordOpen();
                    }}
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

        {/* 历史记录预览弹窗 - HeroUI Modal */}
        <Modal
          isOpen={isPreviewRecordOpen}
          onOpenChange={onPreviewRecordOpenChange}
          size="4xl"
          backdrop="blur"
          scrollBehavior="inside"
          classNames={{
            backdrop: "bg-[#0f0c29]/80 backdrop-blur-md",
            base: "border-[#292f46] bg-[#19172c] text-[#a8b0d3]",
            header: "border-b-[1px] border-[#292f46]",
            body: "py-6",
            closeButton: "hover:bg-white/5 active:bg-white/10",
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                {previewRecord && (
                  <>
                    <ModalHeader className="flex flex-col gap-1">
                      <h3 className="heading-display text-lg text-white">
                        {previewRecord.fileName}
                      </h3>
                      <p className="text-sm text-white/50 font-normal">
                        {previewRecord.width} × {previewRecord.height} · {formatTime(previewRecord.createdAt)}
                      </p>
                    </ModalHeader>
                    <ModalBody>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="glass-card p-4">
                          <span className="tag text-xs mb-3 inline-block">原图</span>
                          <img
                            src={previewRecord.originalImage}
                            alt="原图"
                            className="w-full rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                            onClick={() => {
                              setPreviewImage({
                                src: previewRecord.originalImage,
                                title: "原图",
                                fileName: previewRecord.fileName,
                                isProcessed: false,
                              });
                              onPreviewImageOpen();
                            }}
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
                            onClick={() => {
                              setPreviewImage({
                                src: previewRecord.processedImage,
                                title: "已移除水印",
                                fileName: previewRecord.fileName,
                                isProcessed: true,
                              });
                              onPreviewImageOpen();
                            }}
                          />
                        </div>
                      </div>
                    </ModalBody>
                  </>
                )}
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 图片大图预览弹窗 - HeroUI Modal */}
        <Modal
          isOpen={isPreviewImageOpen}
          onOpenChange={onPreviewImageOpenChange}
          size="full"
          backdrop="blur"
          classNames={{
            backdrop: "bg-[#0f0c29]/90 backdrop-blur-md",
            base: "bg-transparent shadow-none",
            body: "flex items-center justify-center",
            closeButton: "hover:bg-white/5 active:bg-white/10 text-white",
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                {previewImage && (
                  <ModalBody>
                    <div className="flex flex-col items-center gap-4">
                      <span className="tag text-sm">{previewImage.title}</span>
                      <img
                        src={previewImage.src}
                        alt={previewImage.title}
                        className="max-w-[90vw] max-h-[75vh] rounded-xl object-contain"
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
                        className="btn-liquid btn-primary flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        下载图片
                      </button>
                    </div>
                  </ModalBody>
                )}
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 清空确认弹窗 - HeroUI Modal */}
        <Modal
          isOpen={isClearConfirmOpen}
          onOpenChange={onClearConfirmOpenChange}
          size="sm"
          backdrop="blur"
          classNames={{
            backdrop: "bg-[#0f0c29]/80 backdrop-blur-md",
            base: "border-[#292f46] bg-[#19172c] text-[#a8b0d3]",
            header: "border-b-[1px] border-[#292f46]",
            footer: "border-t-[1px] border-[#292f46]",
            closeButton: "hover:bg-white/5 active:bg-white/10",
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-[#ff6b9d]" />
                    <span className="text-white">清空历史记录</span>
                  </div>
                </ModalHeader>
                <ModalBody>
                  <p className="text-white/70">确定要清空所有历史记录吗？此操作无法撤销。</p>
                </ModalBody>
                <ModalFooter>
                  <Button
                    variant="light"
                    onPress={onClose}
                    className="text-white/70 hover:text-white"
                  >
                    取消
                  </Button>
                  <Button
                    color="danger"
                    onPress={() => {
                      handleClearHistory();
                      onClose();
                    }}
                    className="bg-[#ff6b9d] text-white"
                  >
                    确认清空
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

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
                multiple
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
                    拖放图片到这里（支持批量）
                  </p>
                  <p className="text-white/50">或点击选择文件（可多选）</p>
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
              <p className="heading-display text-xl text-white">
                {isBatchMode ? "正在批量处理..." : "正在处理..."}
              </p>
              <p className="text-white/50 mt-2">使用反向 Alpha 混合算法移除水印</p>
              {isBatchMode && batchTotal > 1 && (
                <div className="mt-3 space-y-1">
                  <p className="text-white/60">
                    已完成 {batchCompleted} / {batchTotal}
                  </p>
                  {batchCurrent && (
                    <p className="text-white/40 text-sm truncate">当前：{batchCurrent}</p>
                  )}
                </div>
              )}
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

          {/* 处理完成 - 单张 */}
          {state === "done" && !isBatchMode && originalImage && processedImage && (
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
                    onClick={() => {
                      setPreviewImage({
                        src: originalImage,
                        title: "原图",
                        fileName,
                        isProcessed: false,
                      });
                      onPreviewImageOpen();
                    }}
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
                    onClick={() => {
                      setPreviewImage({
                        src: processedImage,
                        title: "已移除水印",
                        fileName,
                        isProcessed: true,
                      });
                      onPreviewImageOpen();
                    }}
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

          {/* 处理完成 - 批量 */}
          {state === "done" && isBatchMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <p className="heading-display text-xl text-white">批量处理完成</p>
                <p className="text-white/50">
                  成功 {batchSuccess} · 失败 {batchFailed}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {batchItems.map((item) => (
                  <div key={item.id} className="glass-card p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-sm text-white truncate min-w-0 flex-1">{item.fileName}</p>
                      {item.status === "done" ? (
                        <span className="tag tag-mint text-[10px] shrink-0 whitespace-nowrap">成功</span>
                      ) : item.status === "error" ? (
                        <span className="tag tag-coral text-[10px] shrink-0 whitespace-nowrap">失败</span>
                      ) : (
                        <span className="tag text-[10px] shrink-0 whitespace-nowrap">处理中</span>
                      )}
                    </div>

                    {item.status === "done" && item.record ? (
                      <>
                        <img
                          src={item.record.processedImage}
                          alt={`${item.fileName} 处理后`}
                          className="w-full aspect-square object-cover rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                          onClick={() => {
                            if (item.record) {
                              setPreviewRecord(item.record);
                              onPreviewRecordOpen();
                            }
                          }}
                        />
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => {
                              if (item.record) {
                                handleDownloadRecord(item.record);
                              }
                            }}
                            className="tag text-xs cursor-pointer hover:bg-white/10 transition-colors"
                          >
                            下载
                          </button>
                          <button
                            onClick={() => {
                              if (item.record) {
                                setPreviewRecord(item.record);
                                onPreviewRecordOpen();
                              }
                            }}
                            className="tag text-xs cursor-pointer hover:bg-white/10 transition-colors"
                          >
                            查看对比
                          </button>
                        </div>
                      </>
                    ) : item.status === "error" ? (
                      <div className="rounded-lg border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3 text-sm text-[#ff6b9d]">
                        {item.error ?? "处理失败"}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/60">
                        等待处理...
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-center gap-4 flex-wrap">
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
