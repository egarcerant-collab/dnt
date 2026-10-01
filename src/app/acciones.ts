'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { leerExcel } from '@/lib/dnt/excel-source';
import { enviarMensaje, type TipoMensaje } from '@/lib/dnt/mensajes';
import { actualizarPrestador, autenticarPrestador, establecerClavePrestador } from '@/lib/prestadores';
import { COOKIE, DURACION_SEG, codificarSesion, esEpsi, getSesion, rutaInicio } from '@/lib/sesion';
import { actualizarUsuario, autenticar, crearUsuario, registrarSolicitud, resolverSolicitud, type RolUsuario } from '@/lib/usuarios';

export type EstadoAccion = { ok: boolean; mensaje: string } | null;

async function guardarSesion(datos: Parameters<typeof codificarSesion>[0]) {
  (await cookies()).set(COOKIE, codificarSesion(datos), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DURACION_SEG,
    path: '/',
  });
}

// ── Ingreso ────────────────────────────────────────────────────────────

/** Funcionarios EPSI y administrador: usuario + contraseña. */
export async function iniciarSesion(form: FormData) {
  const usuario = String(form.get('usuario') ?? '');
  const password = String(form.get('password') ?? '');
  const volver = (error: string) => redirect(`/?error=${error}&modo=epsi`);
  if (!usuario || !password) volver('credenciales');

  const r = await autenticar(usuario, password);
  if (!r.ok) return volver(r.motivo);
  const u = r.usuario;
  if (u.rol === 'prestador') return volver('usar-pestana-prestador');

  await guardarSesion({ id: u.id, usuario: u.usuario, rol: u.rol, nombre: u.nombre });
  redirect(rutaInicio(u.rol));
}

/** Prestadores: eligen su IPS y entran con el NIT, o con su contraseña personal si la crearon. */
export async function iniciarSesionPrestador(form: FormData) {
  const ips = String(form.get('ips') ?? '');
  const password = String(form.get('password') ?? '');
  const volver = (error: string) => redirect(`/?error=${error}&modo=prestador`);
  if (!ips || !password) volver('credenciales');

  const r = await autenticarPrestador(ips, password);
  if (!r.ok) return volver(r.motivo);

  await guardarSesion({
    id: `ips:${r.prestador.ips}`,
    usuario: r.prestador.nit,
    rol: 'prestador',
    nombre: r.prestador.ips,
    ips: r.prestador.ips,
    usaNit: r.debeCambiarClave,
  });
  redirect('/prestador');
}

export async function accionCambiarClavePrestador(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await getSesion();
  if (s?.rol !== 'prestador' || !s.ips) return { ok: false, mensaje: 'No autorizado' };
  const nueva = String(form.get('nueva') ?? '');
  if (nueva !== String(form.get('confirmar') ?? '')) return { ok: false, mensaje: 'Las contraseñas no coinciden' };
  try {
    await establecerClavePrestador(s.ips, nueva);
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  const { exp: _exp, debeCambiarClave: _d, usaNit: _n, ...resto } = s;
  await guardarSesion(resto);
  redirect('/prestador');
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
  redirect('/');
}

// ── Notificaciones y preguntas ─────────────────────────────────────────

export async function accionEnviarMensaje(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await getSesion();
  if (!s || s.debeCambiarClave) return { ok: false, mensaje: 'No autorizado' };
  const casoId = String(form.get('casoId') ?? '') || null;
  const texto = String(form.get('texto') ?? '').trim();
  let ips = String(form.get('ips') ?? '');
  let tipo = String(form.get('tipo') ?? 'notificacion') as TipoMensaje;

  if (casoId) {
    const caso = (await leerExcel()).casos.find(c => c.id === casoId);
    if (!caso) return { ok: false, mensaje: 'Caso no encontrado' };
    ips = caso.ipsSeguimiento;
  }
  if (s.rol === 'prestador') {
    if (ips !== s.ips) return { ok: false, mensaje: 'El caso no pertenece a tu IPS' };
    tipo = 'respuesta';
  } else if (!esEpsi(s.rol) || !['notificacion', 'pregunta'].includes(tipo)) {
    return { ok: false, mensaje: 'Tipo de mensaje inválido' };
  }
  if (!ips) return { ok: false, mensaje: 'Selecciona el prestador' };
  if (texto.length < 3 || texto.length > 2000) return { ok: false, mensaje: 'El mensaje debe tener entre 3 y 2000 caracteres' };

  await enviarMensaje({ casoId, ips, tipo, texto, autorRol: s.rol, autorNombre: s.nombre });
  revalidatePath(casoId ? `/caso/${encodeURIComponent(casoId)}` : '/notificaciones');
  return { ok: true, mensaje: 'Mensaje enviado.' };
}

// ── Administración (solo rol admin) ────────────────────────────────────

async function exigirAdmin() {
  const s = await getSesion();
  if (s?.rol !== 'admin') throw new Error('No autorizado');
  return s;
}

export async function accionCrearUsuario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    await exigirAdmin();
    await crearUsuario({
      usuario: String(form.get('usuario') ?? ''),
      nombre: String(form.get('nombre') ?? ''),
      rol: String(form.get('rol')) as RolUsuario,
      password: String(form.get('password') ?? ''),
    });
    revalidatePath('/admin');
    return { ok: true, mensaje: 'Usuario creado.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function accionActualizarUsuario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    await exigirAdmin();
    const id = String(form.get('id'));
    const activo = form.get('activo');
    const password = String(form.get('password') ?? '');
    await actualizarUsuario(id, {
      activo: activo == null ? undefined : activo === 'true',
      password: password || undefined,
    });
    revalidatePath('/admin');
    return { ok: true, mensaje: password ? 'Contraseña actualizada.' : 'Usuario actualizado.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function accionActualizarPrestador(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    await exigirAdmin();
    const ips = String(form.get('ips'));
    const nit = form.get('nit');
    const activo = form.get('activo');
    const restablecer = form.get('restablecer') === 'true';
    await actualizarPrestador(ips, {
      nit: nit == null ? undefined : String(nit),
      activo: activo == null ? undefined : activo === 'true',
      restablecer,
    });
    revalidatePath('/admin');
    return { ok: true, mensaje: restablecer ? 'Acceso restablecido: vuelve a entrar con el NIT.' : 'Prestador actualizado.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

// ── Registro de funcionarios EPSI (pendiente de aprobación) ────────────

export async function accionRegistrarse(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirmar') ?? '')) return { ok: false, mensaje: 'Las contraseñas no coinciden' };
  try {
    await registrarSolicitud({
      correo: String(form.get('correo') ?? ''),
      nombre: String(form.get('nombre') ?? ''),
      cargo: String(form.get('cargo') ?? ''),
      password,
    });
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  return { ok: true, mensaje: 'Solicitud enviada. Podrás ingresar cuando el administrador la apruebe.' };
}

export async function accionResolverSolicitud(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    await exigirAdmin();
    const id = String(form.get('id'));
    const aprobar = form.get('decision') === 'aprobar';
    const rol = form.get('rol') === 'admin' ? 'admin' : 'epsi';
    await resolverSolicitud(id, aprobar ? { aprobar: true, rol } : { aprobar: false });
    revalidatePath('/admin');
    return { ok: true, mensaje: aprobar ? 'Solicitud aprobada.' : 'Solicitud rechazada.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}
