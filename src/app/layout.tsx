import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoThai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "SongCraft Studio", template: "%s · SongCraft Studio" },
  description: "AI-assisted songwriting workstation for Thai, Isan and English songs.",
};

export const viewport: Viewport = {
  themeColor: "#12151f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${notoThai.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden bg-background text-foreground">
        <TooltipProvider delayDuration={300}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
