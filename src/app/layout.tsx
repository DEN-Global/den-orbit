import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Cross-chain DCA",
  description: "A self-custodial cross-chain dollar-cost averaging vault powered by NEAR Intents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
