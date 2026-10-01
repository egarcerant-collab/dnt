/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['xlsx', 'googleapis'],
  // La plantilla del libro se lee en tiempo de ejecución: incluirla en la función de Vercel
  outputFileTracingIncludes: {
    '/api/exportar-matriz': ['./plantillas/**'],
  },
};
export default nextConfig;
