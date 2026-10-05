import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { imagenFirma, type Firmante } from '../firmas';
import { listarHistorias } from './historias';
import { listarMensajes } from './mensajes';
import { obtenerBase } from './repositorio';
import { ORDEN_SEMAFORO, SEMAFORO, type ClaveSemaforo } from './semaforo';
import { construirTraza, type FilaTraza } from './traza';
import { ALERTAS, type Caso } from './types';

/**
 * Informes PDF en hoja A4 con el membrete institucional (plantillas/membrete-a4.jpg, formato COM-FT-03)
 * y las firmas de los funcionarios al final del documento.
 */
const MEMBRETE = path.join(process.cwd(), 'plantillas', 'membrete-a4.jpg');
const [ANCHO, ALTO] = [595.28, 841.89];
const X0 = 72; // margen izquierdo (después del borde y del sello Vigilado Supersalud)
const X1 = 545; // margen derecho (antes del borde derecho)
const Y_TOPE = 742; // debajo del encabezado del membrete
const Y_PIE = 108; // encima del pie del membrete
const NEGRO = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.4, 0.4, 0.4);
const VERDE_CLARO = rgb(0.84, 0.92, 0.75);

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Las fuentes estándar de PDF solo cubren WinAnsi: se reemplazan los caracteres fuera de ese juego. */
const limpio = (t: string) =>
  t.replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF•·]/g, '');

const hex = (c: string): RGB => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);

function ahoraColombia() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map(x => [x.type, x.value]),
  );
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

interface Columna { titulo: string; ancho: number }

class Documento {
  private pdf!: PDFDocument;
  private fondo!: PDFImage;
  private f!: PDFFont;
  private fb!: PDFFont;
  private pagina!: PDFPage;
  y = Y_TOPE;

  static async crear(titulo: string) {
    const d = new Documento();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(titulo);
    d.pdf.setAuthor('Dusakawi EPSI · Nutria');
    d.pdf.setCreator('Nutria · Monitoreo de Desnutrición');
    d.fondo = await d.pdf.embedJpg(await fs.readFile(MEMBRETE));
    d.f = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.fb = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.nuevaPagina();
    return d;
  }

  nuevaPagina() {
    this.pagina = this.pdf.addPage([ANCHO, ALTO]);
    this.pagina.drawImage(this.fondo, { x: 0, y: 0, width: ANCHO, height: ALTO });
    this.y = Y_TOPE;
  }

  /** Salta de página si no caben `alto` puntos más. */
  espacio(alto: number) {
    if (this.y - alto < Y_PIE) this.nuevaPagina();
  }

  private lineas(texto: string, ancho: number, size: number, negrita = false): string[] {
    const fuente = negrita ? this.fb : this.f;
    const salida: string[] = [];
    for (const parrafo of limpio(texto).split('\n')) {
      let linea = '';
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, size) <= ancho || !linea) linea = prueba;
        else {
          salida.push(linea);
          linea = palabra;
        }
      }
      salida.push(linea);
    }
    return salida;
  }

  texto(t: string, o: { size?: number; negrita?: boolean; alineacion?: 'izq' | 'centro' | 'der'; color?: RGB; antes?: number; despues?: number } = {}) {
    const size = o.size ?? 10;
    const fuente = o.negrita ? this.fb : this.f;
    this.y -= o.antes ?? 0;
    for (const l of this.lineas(t, X1 - X0, size, o.negrita)) {
      this.espacio(size * 1.35);
      const w = fuente.widthOfTextAtSize(l, size);
      const x = o.alineacion === 'centro' ? (X0 + X1 - w) / 2 : o.alineacion === 'der' ? X1 - w : X0;
      this.pagina.drawText(l, { x, y: this.y - size, size, font: fuente, color: o.color ?? NEGRO });
      this.y -= size * 1.35;
    }
    this.y -= o.despues ?? 0;
  }

  /** Etiqueta en negrita seguida de texto normal (DE:, PARA:, ASUNTO:). */
  campo(etiqueta: string, valor: string, despues = 8) {
    const size = 10;
    const wEt = this.fb.widthOfTextAtSize(`${etiqueta} `, size);
    const lineas = this.lineas(valor, X1 - X0 - wEt, size);
    lineas.forEach((l, i) => {
      this.espacio(size * 1.35);
      if (i === 0) this.pagina.drawText(`${etiqueta} `, { x: X0, y: this.y - size, size, font: this.fb, color: NEGRO });
      this.pagina.drawText(l, { x: X0 + wEt, y: this.y - size, size, font: this.f, color: NEGRO });
      this.y -= size * 1.35;
    });
    this.y -= despues;
  }

  tabla(columnas: Columna[], filas: { celdas: string[]; colores?: (string | null)[] }[], size = 8) {
    const total = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map(c => (c.ancho / total) * (X1 - X0));
    const pad = 3;
    const alto = (celdas: string[], negrita: boolean) =>
      Math.max(...celdas.map((c, i) => this.lineas(c, anchos[i] - pad * 2, size, negrita).length)) * size * 1.2 + pad * 2;

    const dibujarFila = (celdas: string[], negrita: boolean, fondos: (RGB | null)[]) => {
      const h = alto(celdas, negrita);
      let x = X0;
      celdas.forEach((c, i) => {
        if (fondos[i]) this.pagina.drawRectangle({ x, y: this.y - h, width: anchos[i], height: h, color: fondos[i]! });
        this.pagina.drawRectangle({ x, y: this.y - h, width: anchos[i], height: h, borderColor: GRIS, borderWidth: 0.5 });
        this.lineas(c, anchos[i] - pad * 2, size, negrita).forEach((l, k) =>
          this.pagina.drawText(l, { x: x + pad, y: this.y - pad - size * (k + 1) * 1.2 + size * 0.25, size, font: negrita ? this.fb : this.f, color: NEGRO }),
        );
        x += anchos[i];
      });
      this.y -= h;
    };
    const encabezado = () => dibujarFila(columnas.map(c => c.titulo), true, columnas.map(() => VERDE_CLARO));

    this.espacio(alto(columnas.map(c => c.titulo), true) + 20);
    encabezado();
    for (const f of filas) {
      const h = alto(f.celdas, false);
      if (this.y - h < Y_PIE) {
        this.nuevaPagina();
        encabezado(); // se repite el encabezado de la tabla en cada página
      }
      dibujarFila(f.celdas, false, (f.colores ?? []).map(c => (c ? hex(c) : null)));
    }
    this.y -= 10;
  }

  /** Bloque de firmas al final del documento: imagen, línea, nombre, cargo y entidad. */
  async firmas(firmantes: Firmante[]) {
    const alto = 112;
    this.espacio(alto + 24);
    this.texto('Atentamente;', { antes: 4, despues: 6 });
    if (!firmantes.length) {
      this.y -= 50;
      this.pagina.drawLine({ start: { x: X0, y: this.y }, end: { x: X0 + 180, y: this.y }, thickness: 0.6, color: NEGRO });
      this.y -= 40;
      return;
    }
    const porFila = Math.min(firmantes.length, 3);
    const anchoBloque = (X1 - X0) / porFila;
    for (let i = 0; i < firmantes.length; i += porFila) {
      this.espacio(alto);
      const yBase = this.y;
      for (const [k, fm] of firmantes.slice(i, i + porFila).entries()) {
        const x = X0 + k * anchoBloque;
        const ancho = Math.min(anchoBloque - 18, 170);
        const bytes = await imagenFirma(fm.firma.archivo);
        if (bytes) {
          const img = fm.firma.archivo.endsWith('.png') ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
          const esc = Math.min(ancho / img.width, 52 / img.height);
          this.pagina.drawImage(img, { x, y: yBase - 56, width: img.width * esc, height: img.height * esc });
        }
        this.pagina.drawLine({ start: { x, y: yBase - 60 }, end: { x: x + ancho, y: yBase - 60 }, thickness: 0.6, color: NEGRO });
        const lineas = [
          { t: fm.nombre.toUpperCase(), b: true },
          ...this.lineas(fm.firma.cargo, ancho, 8.5).map(t => ({ t, b: false })),
          { t: 'Dusakawi EPSI', b: false },
        ];
        lineas.forEach((l, n) =>
          this.pagina.drawText(limpio(l.t), { x, y: yBase - 72 - n * 11, size: l.b ? 9 : 8.5, font: l.b ? this.fb : this.f, color: NEGRO, maxWidth: ancho }),
        );
      }
      this.y = yBase - alto;
    }
  }

  async terminar(): Promise<Uint8Array> {
    const paginas = this.pdf.getPages();
    paginas.forEach((p, i) => {
      const t = `Página ${i + 1} de ${paginas.length}`;
      p.drawText(t, { x: 555 - this.f.widthOfTextAtSize(t, 8.5), y: 756, size: 8.5, font: this.f, color: NEGRO });
    });
    return this.pdf.save();
  }
}

// ── Contenido de los informes ────────────────────────────────────────────

const CERRADOS = ['RECUPERADO', 'FALLECIDO', 'DESCARTADO', 'DESERTADO'];
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');

function pendientesDe(c: Caso, f: FilaTraza): string {
  const p = c.alertas.filter(a => a !== 'NO_CRUZA_SIVIGILA').map(a => ALERTAS[a].titulo);
  if (c.controles.length === 0) p.push('Sin controles registrados');
  if (f.controlesSinHc.length) p.push(`Historia clínica de control${f.controlesSinHc.length > 1 ? 'es' : ''} ${f.controlesSinHc.join(', ')}`);
  return p.join('; ');
}

function conteoSemaforo(filas: FilaTraza[]) {
  const conteo = new Map<ClaveSemaforo, number>();
  filas.forEach(f => conteo.set(f.semaforo, (conteo.get(f.semaforo) ?? 0) + 1));
  return ORDEN_SEMAFORO.filter(k => conteo.get(k)).map(k => ({
    celdas: [SEMAFORO[k].etiqueta, String(conteo.get(k)), `${Math.round(((conteo.get(k) ?? 0) / filas.length) * 100)}%`],
    colores: [SEMAFORO[k].color, null, null],
  }));
}

export interface OpcionesInforme {
  /** IPS del informe; sin IPS se genera el consolidado de toda la red. */
  ips?: string;
  firmantes: Firmante[];
  generadoPor: string;
}

export async function generarInformePdf(o: OpcionesInforme): Promise<{ pdf: Uint8Array; nombre: string; casos: number }> {
  const [base, historias, mensajes] = await Promise.all([obtenerBase(), listarHistorias(), listarMensajes()]);
  const { filas: todas } = construirTraza(base.casos, historias, mensajes);
  const porCaso = new Map(base.casos.map(c => [c.id, c]));
  const filas = o.ips ? todas.filter(f => f.ips === o.ips) : todas;
  const nCtrl = (f: FilaTraza) => porCaso.get(f.id)!.controles.length;
  if (o.ips && !filas.length) throw new Error('La IPS no tiene niños en la base actual');

  const h = ahoraColombia();
  const consecutivo = `NUT-${h.y}${h.m}${h.d}-${h.hh}${h.mm}`;
  const doc = await Documento.crear(`Informe de seguimiento DNT ${o.ips ?? 'Red de prestadores'}`);

  doc.texto('INFORME DE SEGUIMIENTO', { size: 13, negrita: true, alineacion: 'centro', despues: 2 });
  doc.texto(`No: ${consecutivo}`, { negrita: true, alineacion: 'der', despues: 8 });
  doc.texto(`VALLEDUPAR, ${Number(h.d)} DE ${MESES[Number(h.m) - 1]} DE ${h.y}`, { negrita: true, despues: 10 });
  doc.campo('DE:', 'RUTA DE ALTERACIONES NUTRICIONALES - DUSAKAWI EPSI');
  doc.campo('PARA:', o.ips ?? 'RED DE PRESTADORES ADSCRITA A DUSAKAWI EPSI');
  doc.campo('ASUNTO:', `ESTADO DEL SEGUIMIENTO DE NIÑOS Y NIÑAS CON DESNUTRICIÓN AGUDA (CORTE ${fecha(base.fechaCorte)}).`, 12);
  doc.texto('Cordial saludo.', { despues: 8 });
  doc.texto(
    o.ips
      ? 'En cumplimiento del lineamiento para el manejo integrado de la desnutrición aguda moderada y severa (Resolución 2350 de 2020) y de lo pactado en la Ruta de Alteraciones Nutricionales, se presenta el estado del seguimiento de los niños y niñas asignados a su IPS, con base en la información registrada en Nutria.'
      : 'En cumplimiento del lineamiento para el manejo integrado de la desnutrición aguda moderada y severa (Resolución 2350 de 2020), se presenta el consolidado del seguimiento de los niños y niñas con desnutrición aguda por IPS, con base en la información registrada en Nutria.',
    { despues: 10 },
  );

  const activos = filas.filter(f => !CERRADOS.includes(porCaso.get(f.id)!.estado)).length;
  const conAlerta = (a: string) => filas.filter(f => porCaso.get(f.id)!.alertas.includes(a as never)).length;
  doc.texto('1. Resumen', { negrita: true, despues: 4 });
  doc.tabla(
    [{ titulo: 'Indicador', ancho: 3 }, { titulo: 'Valor', ancho: 1 }],
    [
      ['Niños y niñas en seguimiento', filas.length],
      ['Casos activos', activos],
      ['Sin controles registrados', filas.filter(f => nCtrl(f) === 0).length],
      ['Total de controles registrados', filas.reduce((s, f) => s + nCtrl(f), 0)],
      ['Sin control hace más de 4 semanas', conAlerta('SIN_CONTROL_4_SEMANAS')],
      ['Control vencido (más de 14 días)', conAlerta('CONTROL_VENCIDO')],
      ['Controles sin historia clínica', filas.reduce((s, f) => s + f.controlesSinHc.length, 0)],
      ['Preguntas de la EPSI sin responder', filas.reduce((s, f) => s + f.sinResponder, 0)],
      ['Diligenciamiento promedio', `${filas.length ? Math.round(filas.reduce((s, f) => s + f.porcentaje, 0) / filas.length) : 0}%`],
    ].map(([a, b]) => ({ celdas: [String(a), String(b)] })),
    9,
  );

  doc.texto('2. Estado actual (semaforización)', { negrita: true, despues: 4 });
  doc.tabla([{ titulo: 'Estado', ancho: 3 }, { titulo: 'Niños', ancho: 1 }, { titulo: '%', ancho: 1 }], conteoSemaforo(filas), 9);

  if (o.ips) {
    const gestion = filas
      .map(f => ({ f, c: porCaso.get(f.id)!, p: pendientesDe(porCaso.get(f.id)!, f) }))
      .filter(x => x.p && !['FALLECIDO', 'DESCARTADO'].includes(x.c.estado))
      .sort((a, b) => a.c.municipio.localeCompare(b.c.municipio) || a.c.nombre.localeCompare(b.c.nombre));
    doc.texto(`3. Niños y niñas que requieren gestión (${gestion.length})`, { negrita: true, despues: 4 });
    if (gestion.length) {
      doc.tabla(
        [
          { titulo: 'N°', ancho: 0.5 }, { titulo: 'Municipio', ancho: 1.4 }, { titulo: 'Documento', ancho: 1.5 }, { titulo: 'Nombre', ancho: 2.4 },
          { titulo: 'Estado', ancho: 1.5 }, { titulo: 'Contr.', ancho: 0.7 }, { titulo: 'Último control', ancho: 1.1 }, { titulo: 'Pendiente', ancho: 3 },
        ],
        gestion.map((x, i) => {
          const s = SEMAFORO[x.f.semaforo];
          return {
            celdas: [String(i + 1), x.c.municipio, `${x.c.tipoDocumento} ${x.c.documento}`, x.c.nombre, s.etiqueta, String(x.c.controles.length), fecha(x.f.ultimoControl), x.p],
            colores: [null, null, null, null, s.color, null, null, null],
          };
        }),
        7.5,
      );
    } else doc.texto('No hay niños con gestiones pendientes.', { despues: 8 });
    doc.texto(
      'Se solicita gestionar los pendientes relacionados y registrar los controles y las historias clínicas en Nutria. En caso de búsqueda fallida, esta debe soportarse con el formato correspondiente debidamente diligenciado.',
      { antes: 2, despues: 8 },
    );
  } else {
    const porIps = new Map<string, FilaTraza[]>();
    filas.forEach(f => porIps.set(f.ips, [...(porIps.get(f.ips) ?? []), f]));
    doc.texto('3. Seguimiento por IPS', { negrita: true, despues: 4 });
    doc.tabla(
      [
        { titulo: 'IPS', ancho: 3.2 }, { titulo: 'Niños', ancho: 0.8 }, { titulo: 'Activos', ancho: 0.9 }, { titulo: 'Sin controles', ancho: 1 },
        { titulo: 'Sin control > 4 sem.', ancho: 1.1 }, { titulo: 'Control vencido', ancho: 1 }, { titulo: 'Controles sin HC', ancho: 1 }, { titulo: 'Diligen.', ancho: 0.9 },
      ],
      [...porIps.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([ips, grupo]) => ({
          celdas: [
            ips,
            String(grupo.length),
            String(grupo.filter(f => !CERRADOS.includes(porCaso.get(f.id)!.estado)).length),
            String(grupo.filter(f => nCtrl(f) === 0).length),
            String(grupo.filter(f => porCaso.get(f.id)!.alertas.includes('SIN_CONTROL_4_SEMANAS')).length),
            String(grupo.filter(f => porCaso.get(f.id)!.alertas.includes('CONTROL_VENCIDO')).length),
            String(grupo.reduce((s, f) => s + f.controlesSinHc.length, 0)),
            `${Math.round(grupo.reduce((s, f) => s + f.porcentaje, 0) / grupo.length)}%`,
          ],
        })),
      7.5,
    );
  }

  await doc.firmas(o.firmantes);
  doc.texto(`Generado en Nutria por ${o.generadoPor} el ${h.d}/${h.m}/${h.y} a las ${h.hh}:${h.mm}. Fuente: base de seguimiento DNT con corte ${fecha(base.fechaCorte)}.`, {
    size: 7.5,
    color: GRIS,
    antes: 4,
  });

  const sufijo = (o.ips ?? 'RED').normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);
  return { pdf: await doc.terminar(), nombre: `Informe_DNT_${sufijo}_${h.y}${h.m}${h.d}.pdf`, casos: filas.length };
}
