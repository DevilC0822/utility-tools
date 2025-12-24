/**
 * Base64 编解码工具库
 * 支持文本和文件的 Base64 编解码，完全在浏览器本地处理
 */

export type Base64Result = {
  success: boolean;
  data: string;
  error?: string;
  stats?: {
    inputLength: number;
    outputLength: number;
    inputBytes: number;
    outputBytes: number;
  };
};

export type Base64BytesResult = {
  success: boolean;
  bytes: Uint8Array;
  normalized: string;
  error?: string;
};

type DataUriParts = {
  mimeType: string;
  base64: string;
};

const BASE64_REGEX = /^[A-Za-z0-9+/]*=*$/;

/**
 * 规范化 Base64 输入：去除空白、兼容 URL Safe、补齐 padding
 */
export function normalizeBase64Input(base64: string, urlSafe = false): string {
  if (!base64) return "";
  let normalized = base64.replace(/\s/g, "");
  if (urlSafe) {
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
  }
  const padding = normalized.length % 4;
  if (padding) {
    normalized += "=".repeat(4 - padding);
  }
  return normalized;
}

/**
 * 解析 Data URI，提取 MIME 和 Base64
 */
export function parseDataUri(input: string): DataUriParts | null {
  if (!input) return null;
  const text = input.trim();
  if (!text.startsWith("data:")) return null;
  const commaIndex = text.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = text.slice(5, commaIndex);
  const base64Index = meta.indexOf(";base64");
  if (base64Index === -1) return null;
  const mimeType = meta.slice(0, base64Index);
  if (!mimeType) return null;
  const base64 = text.slice(commaIndex + 1);
  return { mimeType, base64 };
}

/**
 * 解码 Base64 为字节数组
 */
export function decodeBase64ToBytes(base64: string, urlSafe = false): Base64BytesResult {
  if (!base64) {
    return { success: true, bytes: new Uint8Array(), normalized: "" };
  }
  const normalized = normalizeBase64Input(base64, urlSafe);
  if (!BASE64_REGEX.test(normalized)) {
    return {
      success: false,
      bytes: new Uint8Array(),
      normalized,
      error: "无效的 Base64 格式：包含非法字符",
    };
  }
  try {
    const binaryStr = atob(normalized);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { success: true, bytes, normalized };
  } catch {
    return {
      success: false,
      bytes: new Uint8Array(),
      normalized,
      error: "无效的 Base64 格式",
    };
  }
}

/**
 * 基于字节头部识别常见图片 MIME
 */
export function detectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "image/webp";
  }
  return null;
}

/**
 * 估算 Base64 解码后的字节大小
 */
export function estimateBase64Bytes(base64: string, urlSafe = false): number {
  if (!base64) return 0;
  const normalized = normalizeBase64Input(base64, urlSafe);
  const paddingMatch = normalized.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

/**
 * 将文本编码为 Base64
 * 支持 UTF-8 中文字符
 */
export function encodeText(text: string, urlSafe = false): Base64Result {
  try {
    if (!text) {
      return {
        success: true,
        data: "",
        stats: { inputLength: 0, outputLength: 0, inputBytes: 0, outputBytes: 0 },
      };
    }

    // 使用 TextEncoder 处理 UTF-8
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const inputBytes = bytes.length;

    // 转换为 Base64
    let base64 = btoa(String.fromCharCode(...bytes));

    // URL Safe 模式：替换 +/ 为 -_
    if (urlSafe) {
      base64 = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    return {
      success: true,
      data: base64,
      stats: {
        inputLength: text.length,
        outputLength: base64.length,
        inputBytes,
        outputBytes: base64.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: "",
      error: err instanceof Error ? err.message : "编码失败",
    };
  }
}

/**
 * 将 Base64 解码为文本
 * 支持 UTF-8 中文字符
 */
export function decodeText(base64: string, urlSafe = false): Base64Result {
  try {
    if (!base64) {
      return {
        success: true,
        data: "",
        stats: { inputLength: 0, outputLength: 0, inputBytes: 0, outputBytes: 0 },
      };
    }

    const bytesResult = decodeBase64ToBytes(base64, urlSafe);
    if (!bytesResult.success) {
      return {
        success: false,
        data: "",
        error: bytesResult.error ?? "无效的 Base64 格式",
      };
    }

    // 使用 TextDecoder 处理 UTF-8
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = decoder.decode(bytesResult.bytes);

    return {
      success: true,
      data: text,
      stats: {
        inputLength: base64.replace(/\s/g, "").length,
        outputLength: text.length,
        inputBytes: bytesResult.normalized.length,
        outputBytes: bytesResult.bytes.length,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "InvalidCharacterError") {
      return {
        success: false,
        data: "",
        error: "无效的 Base64 格式",
      };
    }
    return {
      success: false,
      data: "",
      error: err instanceof Error ? err.message : "解码失败",
    };
  }
}

/**
 * 将文件转换为 Base64 Data URI
 */
export function fileToBase64(file: File): Promise<Base64Result> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUri = reader.result as string;
      // 提取纯 Base64 部分（去掉 data:mime/type;base64, 前缀）
      const base64 = dataUri.split(",")[1] ?? "";

      resolve({
        success: true,
        data: dataUri,
        stats: {
          inputLength: file.size,
          outputLength: dataUri.length,
          inputBytes: file.size,
          outputBytes: dataUri.length,
        },
      });
    };

    reader.onerror = () => {
      resolve({
        success: false,
        data: "",
        error: "文件读取失败",
      });
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 将 Base64 转换为 Blob（用于下载）
 */
export function base64ToBlob(
  base64: string,
  mimeType = "application/octet-stream",
  urlSafe = false
): Blob | null {
  try {
    // 处理 Data URI 格式
    let pureBase64 = base64;
    let detectedMime = mimeType;

    const parsed = parseDataUri(base64);
    if (parsed) {
      detectedMime = parsed.mimeType;
      pureBase64 = parsed.base64;
    }

    const decoded = decodeBase64ToBytes(pureBase64, urlSafe);
    if (!decoded.success) return null;

    return new Blob([decoded.bytes], { type: detectedMime });
  } catch {
    return null;
  }
}

/**
 * 检测 Base64 字符串是否为图片
 */
export function isImageBase64(base64: string, urlSafe = false): boolean {
  const parsed = parseDataUri(base64);
  if (parsed && parsed.mimeType.startsWith("image/")) {
    return true;
  }
  const decoded = decodeBase64ToBytes(base64, urlSafe);
  if (!decoded.success) return false;
  return detectImageMimeType(decoded.bytes) !== null;
}

/**
 * 获取 Base64 图片的 MIME 类型
 */
export function getImageMimeType(base64: string, urlSafe = false): string | null {
  const parsed = parseDataUri(base64);
  if (parsed) {
    return parsed.mimeType.startsWith("image/") ? parsed.mimeType : null;
  }
  const decoded = decodeBase64ToBytes(base64, urlSafe);
  if (!decoded.success) return null;
  return detectImageMimeType(decoded.bytes);
}

/**
 * 格式化 Base64 输出（每行固定字符数）
 */
export function formatBase64(base64: string, lineLength = 76): string {
  if (!base64 || lineLength <= 0) return base64;
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    lines.push(base64.slice(i, i + lineLength));
  }
  return lines.join("\n");
}

/**
 * 计算字节大小的可读格式
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
