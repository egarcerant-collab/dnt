import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { BLOQUES_CONTROL, COL_AX, COL_UBICACION, TOTAL_COLUMNAS, camposBloque, leerExcel } from '@/lib/dnt/excel-source';
import { departamentoCanonico, ipsCanonica, municipioCanonico } from '@/lib/dnt/catalogo';
import { filtrarCasos } from '@/lib/dnt/filtros';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { getStore } from '@/lib/dnt/store';
import type { Caso } from '@/lib/dnt/types';
import { esEpsi, getSesion } from '@/lib/sesion';

const PLANTILLA = path.join(process.cwd(), 'plantillas', 'libro-prestadores.xlsx');
const FILAS_ENCABEZADO = 3;
const COL_ESTADO = 29; // AD
const COL_FECHA_RECUPERACION = 30; // AE

const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);
const celda = (v: unknown) => (v instanceof Date ? dmy(v.toISOString().slice(0, 10)) : v ?? null);

/** Fila A..KF: columnas azules desde la base y bloques AX..KF con lo diligenciado por el prestador. */
function filaMatriz(caso: Caso, original: unknown[]): unknown[] {
  const fila = Array.from({ length: TOTAL_COLUMNAS }, (_, i) => celda(original[i]));
  fila[COL_ESTADO] = caso.estado === 'SIN DILIGENCIAR' ? fila[COL_ESTADO] : caso.estado;
  fila[COL_FECHA_RECUPERACION] = dmy(caso.fechaRecuperacion) ?? fila[COL_FECHA_RECUPERACION];
  fila[COL_AX] = caso.ipsAtencionPrimaria || null;
  // Casos movidos por la EPSI: se escribe la ubicación corregida
  if (departamentoCanonico(fila[COL_UBICACION.departamento]) !== caso.departamento) fila[COL_UBICACION.departamento] = caso.departamento;
  if (municipioCanonico(fila[COL_UBICACION.municipio]) !== caso.municipio) fila[COL_UBICACION.municipio] = caso.municipio;
  if (caso.ipsSeguimiento !== 'SIN IPS ASIGNADA' && ipsCanonica(fila[COL_UBICACION.ipsSeguimiento]) !== caso.ipsSeguimiento) fila[COL_UBICACION.ipsSeguimiento] = caso.ipsSeguimiento;

  // Se limpian los bloques y se reescriben en orden, uno por control
  for (const [inicio, tam] of BLOQUES_CONTROL) for (let j = 0; j < tam; j++) fila[inicio + j] = null;
  caso.controles.slice(0, BLOQUES_CONTROL.length).forEach((k, i) => {
    const [c, tam] = BLOQUES_CONTROL[i];
    const p = camposBloque(tam);
    fila[c + p.fecha] = dmy(k.fecha);
    fila[c + p.peso] = k.peso;
    fila[c + p.talla] = k.talla;
    fila[c + p.z] = k.zPesoTalla;
    fila[c + p.clasificacion] = k.clasificacion || null;
    fila[c + p.energia] = k.energia || null;
    if (p.fechaFtlc != null) fila[c + p.fechaFtlc] = dmy(k.fechaEntregaFtlc);
    fila[c + p.medicamento] = k.medicamento || null;
    fila[c + p.recomendaciones] = k.recomendaciones || null;
    fila[c + p.resultado] = k.resultado || null;
    fila[c + p.ips] = k.ips || null;
    fila[c + p.observaciones] = k.observaciones || null;
    fila[c + p.profesional] = k.profesional || k.registradoPor || null;
  });
  return fila;
}

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return new Response('No autorizado', { status: 403 });

  const params = new URL(req.url).searchParams;
  const filtros = { depto: params.get('depto') || undefined, municipio: params.get('municipio') || undefined, ips: params.get('ips') || undefined };
  const casos = filtrarCasos((await obtenerBase()).casos, filtros);
  const originales = (await leerExcel()).filas;

  // Encabezados (filas 1–3) y celdas combinadas tomados de la plantilla oficial
  const libro = XLSX.read(fs.readFileSync(PLANTILLA));
  const plantilla = libro.Sheets[libro.SheetNames[0]];
  const encabezado = XLSX.utils.sheet_to_json<unknown[]>(plantilla, { header: 1, defval: null, range: 0 }).slice(0, FILAS_ENCABEZADO);
  const filas = casos.map(c => filaMatriz(c, originales.get(c.id) ?? []));

  const hoja = XLSX.utils.aoa_to_sheet([...encabezado, ...filas]);
  hoja['!merges'] = plantilla['!merges'];
  hoja['!freeze'] = { xSplit: 0, ySplit: FILAS_ENCABEZADO };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, 'BD seg ambulatorio DNTA');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const store = getStore();
  const log = (await store.leer<object[]>('auditoria-exportaciones.json')) ?? [];
  log.push({ fecha: new Date().toISOString(), usuario: sesion.usuario, tipo: 'matriz-completa', filtros, casos: casos.length });
  await store.escribir('auditoria-exportaciones.json', log.slice(-5000));

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="matriz_dnt_A-KF_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
