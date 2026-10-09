/**
 * Lectura de una base externa de seguimiento DNT (p. ej. SeguimientoDNT del INS) para cruzarla con Nutria.
 * Código puro: se usa en el navegador (el archivo no se sube al servidor) y en pruebas.
 */

export interface NinoArchivo {
  clave: string;
  tipo: string;
  documento: string;
  nombre: string;
  departamento: string;
  municipio: string;
  upgd: string;
  /** Fecha más reciente (AAAA-MM-DD): de consulta si hay seguimiento; de registro del caso (AQ) si la clasificación está vacía. */
  fecha: string;
  registros: number;
  estadoVital: string;
  fuente: string;
  /** Registros con clasificación nutricional (columna BF NomClasificacionNutricional): seguimientos reales. */
  seguimientos: number;
  /** Clasificación nutricional del seguimiento más reciente. */
  clasificacion: string;
  fechaClasificacion: string;
  /** Años (por FechaRegistroCaso) de los registros con clasificación nutricional vacía: notificaciones sin seguimiento. */
  aniosSinSeguimiento: string[];
  /** Todas las columnas del registro más reciente (encabezado → valor), para el pre-registro. */
  datos: Record<string, string>;
}

/** Sin seguimiento: tiene un registro con la clasificación nutricional vacía (solo notificación) en ese año, o en cualquiera. */
export const sinSeguimiento = (n: NinoArchivo, anio = 'Todos') =>
  anio === 'Todos' ? n.aniosSinSeguimiento.length > 0 : n.aniosSinSeguimiento.includes(anio);

export const clave = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
const texto = (v: unknown) => String(v ?? '').trim();

export function fechaISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); // serial de Excel
  const s = texto(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** Ubica las columnas por nombre de encabezado; la identificación cae en la H si no se encuentra. */
function columnas(encabezado: unknown[]) {
  const idx = (...nombres: string[]) => {
    const n = encabezado.map(h => clave(h));
    for (const x of nombres) {
      const i = n.indexOf(clave(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const doc = idx('NroIdentificacion', 'NumeroIdentificacion', 'Documento', 'NumIde');
  return {
    doc: doc >= 0 ? doc : 7,
    tipo: idx('TipoIdentificacion', 'TipoDocumento', 'TipIde'),
    nombres: ['PrimerNombre', 'SegundoNombre', 'PrimerApellido', 'SegundoApellido'].map(n => idx(n)),
    depto: idx('NomDeptoDistritoResidencia', 'Departamento'),
    mpio: idx('NomMpioResidencia', 'Municipio'),
    upgd: idx('NomUPGD', 'UPGD'),
    fechas: [idx('FechaConsulta'), idx('FechaRegistroCaso'), idx('FechaNotificacion')].filter(i => i >= 0),
    // Registros sin seguimiento (clasificación vacía): la fecha que vale es la de registro del caso
    fechasRegistro: [idx('FechaRegistroCaso'), idx('FechaRegistroPersona'), idx('FechaRegistro'), idx('FechaConsulta')].filter(i => i >= 0),
    vital: idx('EstadoVital'),
    fuente: idx('Fuente'),
    clasif: idx('NomClasificacionNutricional', 'ClasificacionNutricional'),
  };
}

export function leerArchivo(filas: unknown[][]): { ninos: Map<string, NinoArchivo>; totalFilas: number } {
  // Encabezado: primera fila (de las 10 primeras) que tenga la columna de identificación
  const iEnc = Math.max(0, filas.slice(0, 10).findIndex(f => f.some(c => /IDENTIFICACION|DOCUMENTO/.test(clave(c)))));
  const encabezado = (filas[iEnc] ?? []).map((h, i) => texto(h) || `COL_${i + 1}`);
  const c = columnas(filas[iEnc] ?? []);
  const ninos = new Map<string, NinoArchivo>();
  let totalFilas = 0;
  for (const f of filas.slice(iEnc + 1)) {
    const k = clave(f[c.doc]);
    if (!k) continue;
    totalFilas++;
    const previo = ninos.get(k);
    const clasif = c.clasif >= 0 ? texto(f[c.clasif]) : '';
    const fecha = (clasif || c.clasif < 0 ? c.fechas : c.fechasRegistro).map(i => fechaISO(f[i])).find(Boolean) ?? '';
    // La clasificación vigente es la del seguimiento más reciente que la tenga
    const usarClasif = !!clasif && (!previo?.clasificacion || fecha >= previo.fechaClasificacion);
    const dato: NinoArchivo = {
      clave: k,
      tipo: c.tipo >= 0 ? texto(f[c.tipo]) : '',
      documento: texto(f[c.doc]),
      nombre: c.nombres.filter(i => i >= 0).map(i => texto(f[i])).filter(Boolean).join(' '),
      departamento: c.depto >= 0 ? texto(f[c.depto]) : '',
      municipio: c.mpio >= 0 ? texto(f[c.mpio]) : '',
      upgd: c.upgd >= 0 ? texto(f[c.upgd]) : '',
      fecha,
      registros: (previo?.registros ?? 0) + 1,
      estadoVital: c.vital >= 0 ? texto(f[c.vital]) : '',
      fuente: c.fuente >= 0 ? texto(f[c.fuente]) : '',
      seguimientos: (previo?.seguimientos ?? 0) + (clasif ? 1 : 0),
      clasificacion: usarClasif ? clasif : (previo?.clasificacion ?? ''),
      fechaClasificacion: usarClasif ? fecha : (previo?.fechaClasificacion ?? ''),
      datos: Object.fromEntries(encabezado.map((h, i) => [h, f[i] instanceof Date ? fechaISO(f[i]) : texto(f[i])]).filter(([, v]) => v !== '')),
      aniosSinSeguimiento: [...new Set([...(previo?.aniosSinSeguimiento ?? []), ...(!clasif && c.clasif >= 0 && fecha ? [fecha.slice(0, 4)] : [])])],
    };
    // Se conserva la información del registro más reciente de cada niño
    const acumulado = { registros: dato.registros, seguimientos: dato.seguimientos, clasificacion: dato.clasificacion, fechaClasificacion: dato.fechaClasificacion, aniosSinSeguimiento: dato.aniosSinSeguimiento };
    ninos.set(k, previo && previo.fecha > fecha ? { ...previo, ...acumulado } : dato);
  }
  return { ninos, totalFilas };
}
