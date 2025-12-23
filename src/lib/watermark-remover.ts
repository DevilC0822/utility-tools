/**
 * Gemini 水印移除核心算法
 *
 * 原理：Gemini 使用 Alpha 混合添加水印
 *   watermarked = α × logo + (1 - α) × original
 *
 * 反向计算还原原始像素：
 *   original = (watermarked - α × logo) / (1 - α)
 */

import watermarkAssets from "./watermark-assets.json";

// 水印尺寸配置
interface WatermarkConfig {
  size: number; // 48 或 96
  margin: number; // 边距 32 或 64
}

// 缓存解码后的 Alpha Map
let alphaMap48: Float32Array | null = null;
let alphaMap96: Float32Array | null = null;

/**
 * 根据图像尺寸判断水印配置
 * 规则：W > 1024 且 H > 1024 → 96×96，否则 48×48
 */
export function getWatermarkConfig(
  width: number,
  height: number
): WatermarkConfig {
  if (width > 1024 && height > 1024) {
    return { size: 96, margin: 64 };
  }
  return { size: 48, margin: 32 };
}

/**
 * 从 Base64 PNG 加载并计算 Alpha Map
 */
async function loadAlphaMap(base64: string, size: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 Canvas 上下文"));
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const pixels = imageData.data;

      // 计算 Alpha Map：取 RGB 最大值 / 255
      const alphaMap = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        const maxVal = Math.max(r, g, b);
        alphaMap[i] = maxVal / 255;
      }

      resolve(alphaMap);
    };
    img.onerror = () => reject(new Error("加载 Alpha Map 图像失败"));
    img.src = `data:image/png;base64,${base64}`;
  });
}

/**
 * 获取 Alpha Map（带缓存）
 */
async function getAlphaMap(size: 48 | 96): Promise<Float32Array> {
  if (size === 48) {
    if (!alphaMap48) {
      alphaMap48 = await loadAlphaMap(watermarkAssets.bg_48_base64, 48);
    }
    return alphaMap48;
  } else {
    if (!alphaMap96) {
      alphaMap96 = await loadAlphaMap(watermarkAssets.bg_96_base64, 96);
    }
    return alphaMap96;
  }
}

/**
 * 移除水印核心算法
 */
export async function removeWatermark(
  imageData: ImageData,
  forceSize?: 48 | 96
): Promise<ImageData> {
  const { width, height, data } = imageData;

  // 确定水印配置
  const config = forceSize
    ? { size: forceSize, margin: forceSize === 48 ? 32 : 64 }
    : getWatermarkConfig(width, height);

  // 获取 Alpha Map
  const alphaMap = await getAlphaMap(config.size as 48 | 96);

  // 计算水印位置（右下角）
  const posX = width - config.margin - config.size;
  const posY = height - config.margin - config.size;

  // 常量
  const ALPHA_THRESHOLD = 0.002; // 忽略极小的 alpha
  const MAX_ALPHA = 0.99; // 避免除零
  const LOGO_VALUE = 255; // 白色水印

  // 创建输出数据副本
  const output = new Uint8ClampedArray(data);

  // 反向 Alpha 混合
  for (let row = 0; row < config.size; row++) {
    for (let col = 0; col < config.size; col++) {
      const imgX = posX + col;
      const imgY = posY + row;

      // 边界检查
      if (imgX < 0 || imgX >= width || imgY < 0 || imgY >= height) {
        continue;
      }

      const alphaIdx = row * config.size + col;
      let alpha = alphaMap[alphaIdx];

      // 跳过无水印效果的像素
      if (alpha < ALPHA_THRESHOLD) {
        continue;
      }

      // 限制 alpha 避免除零
      alpha = Math.min(alpha, MAX_ALPHA);
      const oneMinusAlpha = 1 - alpha;

      const pixelIdx = (imgY * width + imgX) * 4;

      // 对 RGB 三通道分别处理
      for (let c = 0; c < 3; c++) {
        const watermarked = data[pixelIdx + c];
        const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
        output[pixelIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
      }
      // Alpha 通道保持不变
    }
  }

  return new ImageData(output, width, height);
}

/**
 * 处理图片文件并返回处理后的 Blob
 */
export async function processImage(
  file: File,
  forceSize?: 48 | 96
): Promise<{ original: string; processed: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      const originalDataUrl = e.target?.result as string;
      img.onload = async () => {
        try {
          // 创建 Canvas 并绘制原图
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法创建 Canvas 上下文"));
            return;
          }

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);

          // 移除水印
          const processedData = await removeWatermark(imageData, forceSize);
          ctx.putImageData(processedData, 0, 0);

          // 转换为 Blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("转换图像失败"));
                return;
              }
              const processedDataUrl = canvas.toDataURL("image/png");
              resolve({
                original: originalDataUrl,
                processed: processedDataUrl,
                blob,
              });
            },
            "image/png",
            1.0
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("加载图像失败"));
      img.src = originalDataUrl;
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
