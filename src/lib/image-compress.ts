export type OutputFormat = "auto" | "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export type CompressOptions = {
  outputFormat: OutputFormat;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  backgroundColor?: string;
  enableQuantization: boolean;
  quantizeColors: number;
  quantizeMaxPixels: number;
  quantizeSampleSize: number;
  keepOriginalIfLarger?: boolean;
};

export type CompressResult = {
  blob: Blob;
  outputType: string;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  usedOriginal?: boolean;
  note?: string;
};

export const SUPPORTED_INPUT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/bmp",
];

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: "auto", label: "智能（保真优先）" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/webp", label: "WebP" },
  { value: "image/avif", label: "AVIF" },
  { value: "image/png", label: "PNG" },
];

const LOSSY_TYPES = new Set<string>(["image/jpeg", "image/webp", "image/avif"]);
const AUTO_FALLBACK_MAP: Record<string, string> = {
  "image/bmp": "image/png",
};
const MIN_QUANTIZE_COLORS = 8;
const ANALYSIS_MAX_PIXELS = 65536;

type ColorBox = {
  colors: number[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
};

export function isLossyType(type: string): boolean {
  return LOSSY_TYPES.has(type);
}

export function resolveOutputType(inputType: string, outputFormat: OutputFormat): string {
  if (outputFormat === "auto") {
    if (AUTO_FALLBACK_MAP[inputType]) {
      return AUTO_FALLBACK_MAP[inputType];
    }
    return inputType || "image/jpeg";
  }
  return outputFormat;
}

export function isCanvasTypeSupported(type: string): boolean {
  if (typeof document === "undefined") return true;
  const canvas = document.createElement("canvas");
  const dataUrl = canvas.toDataURL(type);
  return dataUrl.startsWith(`data:${type}`);
}

export function resolveTargetSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const widthLimit = maxWidth > 0 ? maxWidth : width;
  const heightLimit = maxHeight > 0 ? maxHeight : height;
  const ratio = Math.min(widthLimit / width, heightLimit / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

type ImageAnalysis = {
  hasAlpha: boolean;
  uniqueColors: number;
};

function analyzeCanvas(
  canvas: HTMLCanvasElement,
  maxPixels: number,
  maxColorsToCount: number
): ImageAnalysis | null {
  const { width, height } = canvas;
  const totalPixels = width * height;
  const scale = totalPixels > maxPixels ? Math.sqrt(maxPixels / totalPixels) : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = targetWidth;
  analysisCanvas.height = targetHeight;
  const ctx = analysisCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const colors = new Set<number>();
  const colorLimit = Math.max(1, Math.floor(maxColorsToCount));
  let hasAlpha = false;
  let reachedLimit = false;

  for (let i = 0; i < data.length; i += 4) {
    if (!hasAlpha && data[i + 3] < 255) {
      hasAlpha = true;
    }
    if (!reachedLimit) {
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colors.add(color);
      if (colors.size > colorLimit) {
        reachedLimit = true;
      }
    }
    if (hasAlpha && reachedLimit) break;
  }

  return { hasAlpha, uniqueColors: colors.size };
}

function getChannelValue(color: number, channel: "r" | "g" | "b"): number {
  if (channel === "r") return (color >> 16) & 0xff;
  if (channel === "g") return (color >> 8) & 0xff;
  return color & 0xff;
}

function createColorBox(colors: number[]): ColorBox {
  let rMin = 255;
  let rMax = 0;
  let gMin = 255;
  let gMax = 0;
  let bMin = 255;
  let bMax = 0;

  for (const color of colors) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }

  return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
}

function getBoxLongestChannel(box: ColorBox): "r" | "g" | "b" {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;
  if (rRange >= gRange && rRange >= bRange) return "r";
  if (gRange >= rRange && gRange >= bRange) return "g";
  return "b";
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) return null;
  const channel = getBoxLongestChannel(box);
  const sorted = [...box.colors].sort(
    (a, b) => getChannelValue(a, channel) - getChannelValue(b, channel)
  );
  const mid = Math.floor(sorted.length / 2);
  const left = sorted.slice(0, mid);
  const right = sorted.slice(mid);
  if (left.length === 0 || right.length === 0) return null;
  return [createColorBox(left), createColorBox(right)];
}

function buildPalette(colors: number[], maxColors: number): number[] {
  if (colors.length === 0) return [];
  const boxes: ColorBox[] = [createColorBox(colors)];
  while (boxes.length < maxColors) {
    boxes.sort((a, b) => {
      const aRange = Math.max(a.rMax - a.rMin, a.gMax - a.gMin, a.bMax - a.bMin);
      const bRange = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      return bRange - aRange;
    });
    const box = boxes.shift();
    if (!box) break;
    const split = splitColorBox(box);
    if (!split) {
      boxes.push(box);
      break;
    }
    boxes.push(...split);
  }

  return boxes.map((box) => {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const color of box.colors) {
      rSum += (color >> 16) & 0xff;
      gSum += (color >> 8) & 0xff;
      bSum += color & 0xff;
    }
    const count = Math.max(1, box.colors.length);
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    return (r << 16) | (g << 8) | b;
  });
}

function quantizeImageData(
  imageData: ImageData,
  maxColors: number,
  sampleSize: number
): ImageData {
  const { data } = imageData;
  const totalPixels = data.length / 4;
  const stride = Math.max(1, Math.floor(totalPixels / sampleSize));
  const sampleColors: number[] = [];

  for (let i = 0; i < totalPixels; i += stride) {
    const offset = i * 4;
    const alpha = data[offset + 3];
    if (alpha === 0) continue;
    const color =
      (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
    sampleColors.push(color);
  }

  const palette = buildPalette(sampleColors, maxColors);
  if (palette.length === 0) return imageData;

  const cache = new Map<number, number>();
  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const alpha = data[offset + 3];
    if (alpha === 0) continue;
    const color =
      (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
    const cached = cache.get(color);
    let mapped = cached;
    if (mapped === undefined) {
      let best = palette[0];
      let bestDistance = Infinity;
      for (const paletteColor of palette) {
        const dr = ((color >> 16) & 0xff) - ((paletteColor >> 16) & 0xff);
        const dg = ((color >> 8) & 0xff) - ((paletteColor >> 8) & 0xff);
        const db = (color & 0xff) - (paletteColor & 0xff);
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = paletteColor;
        }
      }
      mapped = best;
      cache.set(color, mapped);
    }
    data[offset] = (mapped >> 16) & 0xff;
    data[offset + 1] = (mapped >> 8) & 0xff;
    data[offset + 2] = mapped & 0xff;
  }

  return imageData;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality)
  );
  if (!blob) {
    throw new Error("压缩失败");
  }
  return blob;
}

function createJpegCanvas(
  source: HTMLCanvasElement,
  backgroundColor: string | undefined
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建绘图上下文");
  }
  ctx.fillStyle = backgroundColor ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function createQuantizedCanvas(
  source: HTMLCanvasElement,
  maxColors: number,
  sampleSize: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建绘图上下文");
  }
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quantized = quantizeImageData(imageData, maxColors, sampleSize);
  ctx.putImageData(quantized, 0, 0);
  return canvas;
}

export async function compressImage(
  file: File,
  options: CompressOptions
): Promise<CompressResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const keepOriginalIfLarger = options.keepOriginalIfLarger ?? true;
  const { width, height } = bitmap;
  const { width: outputWidth, height: outputHeight } = resolveTargetSize(
    width,
    height,
    options.maxWidth,
    options.maxHeight
  );

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = outputWidth;
  baseCanvas.height = outputHeight;
  const ctx = baseCanvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("无法创建绘图上下文");
  }

  ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
  bitmap.close?.();

  const quantizeLimit = Math.max(MIN_QUANTIZE_COLORS, Math.round(options.quantizeColors));
  const analyzeNeeded =
    options.outputFormat === "auto" ||
    (options.enableQuantization && resolveOutputType(file.type, options.outputFormat) === "image/png");
  const analysis = analyzeNeeded
    ? analyzeCanvas(baseCanvas, ANALYSIS_MAX_PIXELS, quantizeLimit * 2)
    : null;
  const inputSupportsAlpha = ["image/png", "image/webp", "image/avif"].includes(file.type);
  const hasAlpha = analysis ? analysis.hasAlpha : inputSupportsAlpha;
  const canQuantize =
    options.enableQuantization &&
    quantizeLimit >= MIN_QUANTIZE_COLORS &&
    outputWidth * outputHeight <= options.quantizeMaxPixels &&
    !!analysis &&
    analysis.uniqueColors <= quantizeLimit * 2;

  const jpegCanvasCache =
    hasAlpha || !isCanvasTypeSupported("image/jpeg")
      ? null
      : createJpegCanvas(baseCanvas, options.backgroundColor);
  let quantizedCanvasCache: HTMLCanvasElement | null = null;

  const resolveCanvas = (type: string, quantized: boolean): HTMLCanvasElement => {
    if (type === "image/jpeg") {
      if (!jpegCanvasCache) {
        return createJpegCanvas(baseCanvas, options.backgroundColor);
      }
      return jpegCanvasCache;
    }
    if (quantized) {
      if (!quantizedCanvasCache) {
        quantizedCanvasCache = createQuantizedCanvas(
          baseCanvas,
          quantizeLimit,
          options.quantizeSampleSize
        );
      }
      return quantizedCanvasCache;
    }
    return baseCanvas;
  };

  if (options.outputFormat !== "auto") {
    const outputType = resolveOutputType(file.type, options.outputFormat);
    if (!isCanvasTypeSupported(outputType)) {
      throw new Error(`浏览器不支持输出格式：${outputType}`);
    }
    const shouldQuantize = canQuantize && outputType === "image/png";
    const quality = isLossyType(outputType) ? options.quality : undefined;
    const blob = await canvasToBlob(resolveCanvas(outputType, shouldQuantize), outputType, quality);
    return {
      blob,
      outputType,
      width,
      height,
      outputWidth,
      outputHeight,
    };
  }

  const candidates: Array<{ type: string; quantized: boolean }> = [];
  const seen = new Set<string>();
  const addCandidate = (type: string, quantized = false) => {
    if (!isCanvasTypeSupported(type)) return;
    const key = `${type}:${quantized ? "quantized" : "base"}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ type, quantized });
  };

  const fallbackType = hasAlpha ? "image/png" : "image/jpeg";
  const resolvedBase = resolveOutputType(file.type, "auto");
  const resolvedSupported = isCanvasTypeSupported(resolvedBase) ? resolvedBase : fallbackType;
  const baseType = hasAlpha && resolvedSupported === "image/jpeg" ? "image/png" : resolvedSupported;

  addCandidate(baseType);
  if (baseType === "image/png" && canQuantize) {
    addCandidate("image/png", true);
  }

  if (hasAlpha) {
    addCandidate("image/webp");
    addCandidate("image/avif");
    if (baseType !== "image/png") {
      addCandidate("image/png");
      if (canQuantize) {
        addCandidate("image/png", true);
      }
    }
  } else {
    addCandidate("image/jpeg");
    addCandidate("image/webp");
    addCandidate("image/avif");
  }

  if (candidates.length === 0) {
    throw new Error("没有可用的输出格式");
  }

  let best:
    | { blob: Blob; type: string; quantized: boolean }
    | null = null;
  for (const candidate of candidates) {
    const quality = isLossyType(candidate.type) ? options.quality : undefined;
    const blob = await canvasToBlob(
      resolveCanvas(candidate.type, candidate.quantized),
      candidate.type,
      quality
    );
    if (!best || blob.size < best.blob.size) {
      best = { blob, type: candidate.type, quantized: candidate.quantized };
    }
  }

  if (!best) {
    throw new Error("压缩失败");
  }

  const canKeepOriginal =
    keepOriginalIfLarger &&
    outputWidth === width &&
    outputHeight === height &&
    file.size > 0;
  if (canKeepOriginal && best.blob.size >= file.size) {
    return {
      blob: file,
      outputType: file.type || best.type,
      width,
      height,
      outputWidth,
      outputHeight,
      usedOriginal: true,
      note: "输出体积未降低，已保留原图",
    };
  }

  return {
    blob: best.blob,
    outputType: best.type,
    width,
    height,
    outputWidth,
    outputHeight,
  };
}
