import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "图片压缩",
  description:
    "智能压缩图片体积，支持批量处理与格式转换。纯前端处理，图片不会上传到服务器，保护隐私安全。",
  keywords: [
    "图片压缩",
    "image compress",
    "JPEG 压缩",
    "PNG 压缩",
    "WebP 压缩",
    "AVIF 压缩",
    "批量压缩",
    "图片处理",
    "在线压缩",
    "隐私安全",
  ],
  openGraph: {
    title: "图片压缩 | Utility Tools",
    description: "智能压缩图片体积，支持批量处理与格式转换，纯前端处理。",
  },
  twitter: {
    card: "summary_large_image",
    title: "图片压缩 | Utility Tools",
    description: "智能压缩图片体积，支持批量处理与格式转换，纯前端处理。",
  },
};

export default function ImageCompressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
