import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// ❗️ [경로 수정] components/ui/sonner
import { Toaster } from "../components/ui/sonner"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Safety Chatbot",
  description: "Construction Safety Chatbot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster /> {/* ❗️ <body> 태그 맨 아래에 추가 */}
      </body>
    </html>
  );
}