/**
 * Descifra el adjunto del correo de respaldo (respaldo-AAAA-MM-DD.json.gz.cifrado).
 * La clave se toma de la variable de entorno BACKUP_PASSWORD (no se pasa como argumento para no dejarla en el historial).
 * PowerShell:  $env:BACKUP_PASSWORD = Read-Host ; npx tsx scripts/descifrar-respaldo.ts <archivo.cifrado> [salida.json]
 */
import crypto from 'crypto';
import fs from 'fs';
import { gunzipSync } from 'zlib';

const [entrada, salida] = process.argv.slice(2);
const clave = process.env.BACKUP_PASSWORD;
if (!entrada || !clave) {
  console.error('Uso: definir BACKUP_PASSWORD y ejecutar npx tsx scripts/descifrar-respaldo.ts <archivo.cifrado> [salida.json]');
  process.exit(1);
}
const buf = fs.readFileSync(entrada);
if (buf.subarray(0, 7).toString() !== 'NUTRIA1') throw new Error('El archivo no es un respaldo cifrado de Nutria');
const sal = buf.subarray(7, 23);
const iv = buf.subarray(23, 35);
const tag = buf.subarray(35, 51);
const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(clave, sal, 32), iv);
d.setAuthTag(tag);
let gz: Buffer;
try {
  gz = Buffer.concat([d.update(buf.subarray(51)), d.final()]);
} catch {
  throw new Error('Clave incorrecta o archivo alterado');
}
const destino = salida || entrada.replace(/(\.json\.gz)?\.cifrado$/, '') + '.json';
fs.writeFileSync(destino, gunzipSync(gz));
console.log(`Respaldo descifrado en ${destino}`);
