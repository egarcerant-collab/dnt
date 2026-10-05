/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['xlsx', 'googleapis'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // La plantilla del libro se lee en tiempo de ejecución: incluirla en la función de Vercel
  outputFileTracingIncludes: {
    '/api/exportar-matriz': ['./plantillas/**'],
    '/api/informes/pdf': ['./plantillas/**'],
  },
};
export default nextConfig;
