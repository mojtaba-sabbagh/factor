import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "فکتور — صدور فاکتور و پیش‌فاکتور",
  description: "سامانه صدور فاکتور و پیش‌فاکتور",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
