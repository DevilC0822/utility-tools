import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gemini 去水印",
  description:
    "使用反向 Alpha 混合算法精确还原原始像素，移除 Gemini、Nano Banana 等 AI 生成图片的水印。纯前端处理，图片不会上传到服务器，完全保护您的隐私。",
  keywords: [
    "Gemini 去水印",
    "Gemini watermark",
    "Gemini watermark remover",
    "Nano 去水印",
    "Nano watermark",
    "Banana 去水印",
    "Banana watermark",
    "AI 图片去水印",
    "AI watermark remover",
    "水印移除",
    "remove watermark",
    "图片处理",
    "在线去水印",
    "隐私安全",
    "Google AI 水印",
    "SynthID",
  ],
  openGraph: {
    title: "Gemini / Nano / Banana 去水印 | Utility Tools",
    description:
      "使用反向 Alpha 混合算法精确还原原始像素，移除 Gemini、Nano Banana 等 AI 生成图片的水印。纯前端处理，保护您的隐私。",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gemini / Nano / Banana 去水印 | Utility Tools",
    description:
      "使用反向 Alpha 混合算法移除 Gemini、Nano Banana 等 AI 生成图片的水印。",
  },
};

export default function GeminiWatermarkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
