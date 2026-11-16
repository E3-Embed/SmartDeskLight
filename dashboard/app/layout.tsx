import type { Metadata, Viewport } from "next";
import { Anuphan, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display-face",
  display: "swap",
});

const sans = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans-face",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SmartDeskLight · แดชบอร์ด",
  description:
    "แผงควบคุมแสงโต๊ะอ่านหนังสืออัจฉริยะ — ดูค่าลักซ์ อุณหภูมิสี และสั่งโหมดการทำงาน",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ede6d6" },
    { media: "(prefers-color-scheme: dark)", color: "#201b16" },
  ],
};

const themeScript = `(function(){try{var q=new URLSearchParams(location.search);var t=q.get("theme")||localStorage.getItem("sdl-theme");if(t==="day")t="studio";if(t==="night")t="graphite";if(["studio","graphite","nordic","blueprint"].indexOf(t)<0){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"graphite":"studio";}document.documentElement.dataset.theme=t;var c=q.get("corners")||localStorage.getItem("sdl-corners");document.documentElement.dataset.corners=c==="sharp"?"sharp":"round";var lg=q.get("logo")||localStorage.getItem("sdl-logo");document.documentElement.dataset.logo=lg==="classic"?"classic":"noodle";}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" data-theme="studio" data-logo="noodle" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
