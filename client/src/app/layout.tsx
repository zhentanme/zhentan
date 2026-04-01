import type { Metadata } from "next";
import { Kumbh_Sans, Ojuju } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const kumbhSans = Kumbh_Sans({
  variable: "--font-kumbh-sans",
  subsets: ["latin"],
});

const ojuju = Ojuju({
  variable: "--font-ojuju",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zhentan",
  description: "Your personalized onchain detective",
  icons: {
    icon: "/favicon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${kumbhSans.variable} ${ojuju.variable} dark antialiased`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
