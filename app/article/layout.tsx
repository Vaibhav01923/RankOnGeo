import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Article Editor",
  robots: { index: false, follow: false },
};

export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
