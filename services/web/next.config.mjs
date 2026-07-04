/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
	  unoptimized: true,
  },
  // Не светить стек в ответах (убирает X-Powered-By: Next.js).
  poweredByHeader: false,
  // Двойной рендер в dev для выявления побочных эффектов/багов; на prod-сборку
  // статического экспорта не влияет.
  reactStrictMode: true,
};

export default nextConfig;
