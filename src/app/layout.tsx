import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "./providers";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Utility Tools | 实用工具集",
    template: "%s | Utility Tools",
  },
  description:
    "一系列令人惊叹的纯前端实用工具集，包括 Gemini 去水印、图片压缩、格式转换等。所有处理均在浏览器本地完成，保护您的隐私安全。",
  keywords: [
    "在线工具",
    "图片处理",
    "Gemini 去水印",
    "图片压缩",
    "格式转换",
    "Base64",
    "JSON 格式化",
    "前端工具",
    "隐私安全",
  ],
  authors: [{ name: "Utility Tools" }],
  creator: "Utility Tools",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "Utility Tools",
    title: "Utility Tools | 实用工具集",
    description:
      "一系列令人惊叹的纯前端实用工具集，所有处理均在浏览器本地完成，保护您的隐私安全。",
  },
  twitter: {
    card: "summary_large_image",
    title: "Utility Tools | 实用工具集",
    description:
      "一系列令人惊叹的纯前端实用工具集，所有处理均在浏览器本地完成，保护您的隐私安全。",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className={`${outfit.variable} ${dmSans.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
