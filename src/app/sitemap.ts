import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://armorpay.net";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/registro`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/propuesta`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/docs/api`, changeFrequency: "weekly", priority: 0.7 },
  ];
}
