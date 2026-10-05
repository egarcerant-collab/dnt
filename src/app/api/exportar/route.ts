import * as XLSX from 'xlsx';
import { filtrarCasos, grupoEdad, semaforoCaso, type FiltrosCasos } from '@/lib/dnt/filtros';
import { obtenerBase, ultimoControl } from '@/lib/dnt/repositorio';
import { getStore } from '@/lib/dnt/store';
import { ALERTAS } from '@/lib/dnt/types';
import { esEpsi, getSesion } from '@/lib/sesion';

const CLAVES: (keyof FiltrosCasos)[] = ['depto', 'municipio', 'ips', 'estado', 'clasificacion', 'alerta', 'edad', 'semaforo', 'controles'];
const ARCHIVO_AUDITORIA = 'auditoria-exportaciones.json';

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return new Response('No autorizado', { status: 403 });

  const params = new URL(req.url).searchParams;
  const f: FiltrosCasos = Object.fromEntries(CLAVES.map(k => [k, params.get(k) || undefined]));
  const base = await obtenerBase();
  const casos = filtrarCasos(base.casos, f);

  const filas = casos.map(c => {
    const u = ultimoControl(c);
    return {
      'Tipo ID': c.tipoDocumento,
      'Documento': c.documento,
      'Nombre': c.nombre,
      'Sexo': c.sexo,
      'Fecha nacimiento': c.fechaNacimiento,
      'Edad (meses)': c.edadMeses,
      'Grupo de edad': grupoEdad(c),
      'Departamento': c.departamento,
      'Municipio': c.municipio,
      'Asentamiento': c.asentamiento,
      'Etnia': c.etnia,
      'Teléfono': c.telefono,
      'IPS seguimiento': c.ipsSeguimiento,
      'Fecha notificación': c.fechaNotificacion,
      'Semana epidemiológica': c.semanaEpi,
      'Clasificación nutricional': c.clasificacionNutricional,
      'Clasificada por Z-score': c.clasificacionPorZ ? 'SI' : 'NO',
      'Clasificación ingreso (texto)': c.clasificacionIngreso,
      'Z P/T ingreso': c.zIngreso,
      'Peso ingreso (kg)': c.pesoIngreso,
      'Talla ingreso (cm)': c.tallaIngreso,
      'Edema': c.edema,
      'Perímetro braquial (cm)': c.perimetroBraquial,
      'Entrega FTLC': c.fechaEntregaFtlc,
      'MIPRES FTLC': c.mipresFtlc,
      'Estado actual': c.estado,
      'Semáforo': semaforoCaso(c).etiqueta,
      'Fecha recuperación': c.fechaRecuperacion,
      'N° controles': c.controles.length,
      'Último control': u?.fecha ?? null,
      'Última clasificación': u?.clasificacion ?? null,
      'Último Z P/T': u?.zPesoTalla ?? null,
      'En SIVIGILA': c.enSivigila ? 'SI' : 'NO',
      'Alertas': c.alertas.map(a => ALERTAS[a].titulo).join(' | '),
    };
  });

  const filtrosTexto = CLAVES.filter(k => f[k]).map(k => `${k}: ${k === 'alerta' ? ALERTAS[f[k] as keyof typeof ALERTAS]?.titulo ?? f[k] : f[k]}`);
  const resumen = [
    ['Nutria · Monitoreo de Desnutrición · Dusakawi EPSI'],
    ['Generado', new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })],
    ['Usuario', `${sesion.nombre} (${sesion.usuario})`],
    ['Filtros', filtrosTexto.join(' · ') || 'Ninguno (todos los casos)'],
    ['Casos exportados', casos.length],
    [],
    ['INFORMACIÓN CON RESERVA LEGAL · Ley 1581/2012 · Res. 1995/1999 · Uso exclusivo para gestión del riesgo'],
  ];

  const wb = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = Object.keys(filas[0] ?? { a: 1 }).map(k => ({ wch: Math.min(40, Math.max(12, k.length + 2)) }));
  hoja['!autofilter'] = { ref: hoja['!ref'] ?? 'A1' };
  XLSX.utils.book_append_sheet(wb, hoja, 'Casos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  // Trazabilidad: quién exportó qué datos personales y cuándo
  const store = getStore();
  const log = (await store.leer<object[]>(ARCHIVO_AUDITORIA)) ?? [];
  log.push({ fecha: new Date().toISOString(), usuario: sesion.usuario, filtros: f, casos: casos.length });
  await store.escribir(ARCHIVO_AUDITORIA, log.slice(-5000));

  const sufijo = (filtrosTexto.length ? '_' + Object.values(f).filter(Boolean).join('_') : '').replace(/[^\w-]+/g, '_').slice(0, 60);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="casos_dnt${sufijo}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
