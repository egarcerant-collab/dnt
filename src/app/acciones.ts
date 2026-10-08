'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { casoVigente, eliminarCaso, moverCaso, restaurarCaso } from '@/lib/dnt/ajustes';
import { guardarFirma, quitarFirma } from '@/lib/firmas';
import { enviarMensaje, type TipoMensaje } from '@/lib/dnt/mensajes';
import { avisarMensajeIps, enviarInformes } from '@/lib/dnt/informe-ips';
import { actualizarPrestador, autenticarPrestador, establecerClavePrestador, guardarContactoPrestador } from '@/lib/prestadores';
import { COOKIE, DURACION_SEG, codificarSesion, esEpsi, getSesion, rutaInicio } from '@/lib/sesion';
import { actualizarUsuario, autenticar, crearUsuario, editarDatosUsuario, esSuperusuario, registrarSolicitud, resolverSolicitud, type RolUsuario } from '@/lib/usuarios';

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
    const caso = await casoVigente(casoId);
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
  // Aviso por correo a la IPS (sin el contenido del mensaje)
  if (tipo !== 'respuesta' && form.get('avisarCorreo') === 'si') {
    const aviso = await avisarMensajeIps(ips, tipo, !!casoId).catch(e => ({ ok: false, motivo: (e as Error).message }));
    return { ok: true, mensaje: aviso.ok ? 'Mensaje enviado y la IPS fue avisada por correo.' : `Mensaje enviado. No se avisó por correo: ${aviso.motivo}.` };
  }
  return { ok: true, mensaje: 'Mensaje enviado.' };
}

// ── Pre-registro del prestador e informes ──────────────────────────────

export async function accionGuardarContacto(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await getSesion();
  if (!s || s.debeCambiarClave || (s.rol !== 'prestador' && s.rol !== 'admin')) return { ok: false, mensaje: 'No autorizado' };
  const ips = s.rol === 'prestador' ? s.ips! : String(form.get('ips') ?? '');
  try {
    await guardarContactoPrestador(
      ips,
      {
        responsable: String(form.get('responsable') ?? ''),
        cargo: String(form.get('cargo') ?? ''),
        correos: String(form.get('correos') ?? ''),
        whatsapp: String(form.get('whatsapp') ?? ''),
        telefono: String(form.get('telefono') ?? ''),
        autoriza: form.get('autoriza') === 'on',
      },
      s.nombre,
    );
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  revalidatePath('/admin');
  if (s.rol === 'prestador') redirect('/prestador');
  return { ok: true, mensaje: 'Datos de contacto guardados.' };
}

export async function accionEnviarInforme(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await getSesion();
  if (!s || !esEpsi(s.rol)) return { ok: false, mensaje: 'No autorizado' };
  const ips = String(form.get('ips') ?? '') || undefined;
  const r = await enviarInformes(ips);
  const ok = r.filter(x => x.ok).length;
  if (ips) return r[0]?.ok ? { ok: true, mensaje: 'Informe enviado por correo.' } : { ok: false, mensaje: r[0]?.motivo ?? 'Prestador no encontrado' };
  if (!r.length) return { ok: false, mensaje: 'No hay IPS activas para notificar.' };
  const fallas = r.filter(x => !x.ok);
  const sinCorreo = fallas.filter(x => /pre-registro/.test(x.motivo ?? '')).length;
  if (ok === 0 && sinCorreo === fallas.length) return { ok: false, mensaje: `Ninguna IPS activa tiene correo registrado (${sinCorreo} sin pre-registro).` };
  return { ok: ok > 0, mensaje: `Informes enviados: ${ok}. Sin enviar: ${fallas.length}${fallas.length ? ` (${fallas[0].motivo})` : ''}.` };
}

// ── Administración (solo rol admin) ────────────────────────────────────

async function exigirAdmin() {
  const s = await getSesion();
  if (s?.rol !== 'admin') throw new Error('No autorizado');
  return s;
}

export async function accionCrearUsuario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const s = await exigirAdmin();
    const rol = (String(form.get('rol')) === 'admin' ? 'admin' : 'epsi') as RolUsuario;
    if (rol === 'admin' && !esSuperusuario(s.usuario)) throw new Error('Solo el superusuario puede crear administradores');
    await crearUsuario({
      usuario: String(form.get('usuario') ?? ''),
      nombre: String(form.get('nombre') ?? ''),
      rol,
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
    const s = await exigirAdmin();
    const id = String(form.get('id'));
    const activo = form.get('activo');
    const password = String(form.get('password') ?? '');
    const rol = form.get('rol');
    await actualizarUsuario(
      id,
      {
        activo: activo == null ? undefined : activo === 'true',
        password: password || undefined,
        rol: rol === 'admin' || rol === 'epsi' ? rol : undefined,
      },
      s.usuario,
    );
    revalidatePath('/admin');
    return { ok: true, mensaje: password ? 'Contraseña actualizada.' : rol ? 'Rol actualizado.' : 'Usuario actualizado.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function accionEditarUsuario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const s = await exigirAdmin();
    await editarDatosUsuario(
      String(form.get('id')),
      { usuario: String(form.get('usuario') ?? ''), nombre: String(form.get('nombre') ?? ''), correo: String(form.get('correo') ?? ''), cargo: String(form.get('cargo') ?? '') },
      s.usuario,
    );
    revalidatePath('/admin');
    return { ok: true, mensaje: 'Datos actualizados.' };
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
    const sesion = await exigirAdmin();
    const id = String(form.get('id'));
    const aprobar = form.get('decision') === 'aprobar';
    const rol = form.get('rol') === 'admin' ? 'admin' : 'epsi';
    await resolverSolicitud(id, aprobar ? { aprobar: true, rol } : { aprobar: false }, sesion.usuario);
    revalidatePath('/admin');
    return { ok: true, mensaje: aprobar ? 'Solicitud aprobada.' : 'Solicitud rechazada.' };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

// ── Firma para los informes PDF (funcionarios EPSI) ────────────────────

export async function accionGuardarFirma(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await getSesion();
  if (!s || !esEpsi(s.rol)) return { ok: false, mensaje: 'No autorizado' };
  try {
    const archivo = form.get('imagen');
    const imagen = archivo instanceof File && archivo.size > 0 ? Buffer.from(await archivo.arrayBuffer()) : undefined;
    await guardarFirma(s.id, { imagen, cargo: String(form.get('cargo') ?? ''), compartida: form.get('compartida') === 'on' });
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  revalidatePath('/mi-firma');
  revalidatePath('/informes');
  return { ok: true, mensaje: 'Firma guardada. Ya puedes usarla en los informes PDF.' };
}

export async function accionQuitarFirma() {
  const s = await getSesion();
  if (!s || !esEpsi(s.rol)) return;
  await quitarFirma(s.id);
  revalidatePath('/mi-firma');
  revalidatePath('/informes');
}

// ── Correcciones de la base: mover o eliminar un registro (confirmando la contraseña) ──

async function confirmarClave(form: FormData) {
  const s = await getSesion();
  if (!s || !esEpsi(s.rol)) throw new Error('No autorizado');
  const r = await autenticar(s.usuario, String(form.get('confirmacion') ?? ''));
  if (!r.ok) throw new Error(r.motivo === 'bloqueado' ? 'Demasiados intentos fallidos. Espera unos minutos.' : 'Contraseña incorrecta');
  return s;
}

function refrescarVistas(id: string) {
  ['/epsi', '/seguimiento', '/prestador', '/admin', '/informes'].forEach(r => revalidatePath(r));
  revalidatePath(`/caso/${encodeURIComponent(id)}`);
}

export async function accionMoverCaso(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get('id') ?? '');
  try {
    const s = await confirmarClave(form);
    await moverCaso(id, { departamento: String(form.get('departamento') ?? ''), municipio: String(form.get('municipio') ?? ''), ips: String(form.get('ips') ?? '') }, s.nombre);
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  refrescarVistas(id);
  return { ok: true, mensaje: 'Registro movido. El cambio quedó en el historial del caso.' };
}

export async function accionEliminarCaso(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get('id') ?? '');
  try {
    const s = await confirmarClave(form);
    if (s.rol !== 'admin') throw new Error('Solo el administrador puede eliminar registros');
    await eliminarCaso(id, String(form.get('motivo') ?? ''), s.nombre);
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  refrescarVistas(id);
  redirect('/seguimiento');
}

export async function accionRestaurarCaso(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const id = String(form.get('id') ?? '');
  try {
    const s = await confirmarClave(form);
    if (s.rol !== 'admin') throw new Error('Solo el administrador puede restaurar registros');
    await restaurarCaso(id, s.nombre);
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  refrescarVistas(id);
  return { ok: true, mensaje: 'Registro restaurado.' };
}
