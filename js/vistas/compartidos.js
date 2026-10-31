// =====================================================================
//  Vista: Puestos compartidos. Grupos de personas que se cubren entre sí:
//  solo una puede estar de vacaciones a la vez (la base rechaza un goce
//  que se superponga). Acá se arman los grupos (admin) y se ven las
//  próximas vacaciones de cada integrante.
// =====================================================================
(function (R) {
  const { $, esc, hoy, fmtFecha, fmtNum, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;

  async function recargar() { R.estado.compartidos = await R.api.compartidos.listar(); }

  async function mostrar() {
    $("pc-lista").innerHTML = R.util.esqueleto.cajas(2);
    let vacaciones;
    try {
      await recargar();
      const vac = R.estado.tipos.filter(t => t.descuenta_vacaciones).map(t => t.clave);
      vacaciones = await R.api.novedades.deTipos(vac);
    } catch (e) {
      $("pc-lista").innerHTML = `<div class="caja"><p class="vacio">${esc(e.message)}</p></div>`;
      return;
    }
    const esAdmin = app().esAdmin(), hoyISO = hoy();
    const grupos = R.estado.compartidos;

    if (!grupos.length) {
      $("pc-lista").innerHTML = `<div class="caja"><p class="vacio">Todavía no hay puestos compartidos.${esAdmin ? " Creá uno con \"Nuevo puesto compartido\" y agregá a las personas que se cubren entre sí (por ejemplo, las dos personas de sistemas)." : " Los arma un admin."}</p></div>`;
      return;
    }

    $("pc-lista").innerHTML = grupos.map(pc => {
      const miembros = pc.miembros.map(id => app().empleado(id)).filter(Boolean);
      // Próximas vacaciones de los integrantes (las que todavía no terminaron)
      const prox = vacaciones.filter(n => pc.miembros.includes(n.empleado_id) && n.fecha_hasta >= hoyISO)
        .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
      const choca = n => prox.find(o => o.id !== n.id && o.empleado_id !== n.empleado_id && o.fecha_desde <= n.fecha_hasta && o.fecha_hasta >= n.fecha_desde);
      const filas = prox.map(n => {
        const e = app().empleado(n.empleado_id), c = choca(n);
        const ahora = n.fecha_desde <= hoyISO;
        return `<tr class="clic" data-empleado="${n.empleado_id}">
          <td>${esc(nombreEmpleado(e))}${ahora ? `<small>De vacaciones ahora</small>` : ""}</td>
          <td>${fmtFecha(n.fecha_desde)}</td><td>${fmtFecha(n.fecha_hasta)}</td>
          <td class="num">${fmtNum(n.cantidad)}</td>
          <td>${c ? `<span class="marca-revisar" tabindex="0" data-info="Se superpone con ${esc(nombreEmpleado(app().empleado(c.empleado_id)))} (${fmtFecha(c.fecha_desde)} al ${fmtFecha(c.fecha_hasta)}). Se cargó antes de armar el grupo: conviene mover una de las dos.">Se superpone</span>` : ""}</td>
        </tr>`;
      }).join("");
      const yaEstan = new Set(pc.miembros);
      return `<div class="caja" data-pc="${pc.id}">
        <div class="pc-cabecera">
          <div><h3 class="pc-nombre">${esc(pc.nombre)}</h3>${pc.descripcion ? `<p class="hint" style="margin:2px 0 0">${esc(pc.descripcion)}</p>` : ""}</div>
          ${esAdmin ? `<div class="acciones-fila"><button type="button" class="link" data-pc-renombrar="${pc.id}">Renombrar</button><button type="button" class="link peligro" data-pc-eliminar="${pc.id}">Eliminar</button></div>` : ""}
        </div>
        <h2 style="margin-top:14px">Integrantes${info("Entre estas personas, solo una puede estar de vacaciones a la vez. Al cargar vacaciones que se superpongan con las de otro integrante, el sistema no las deja guardar.")}</h2>
        <div class="pc-miembros">${miembros.map(e => `<span class="pc-miembro">${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e.sucursal_id))}${e.puesto ? " · " + esc(e.puesto) : ""}</small>${esAdmin ? `<button type="button" class="btn-cerrar" data-pc-quitar="${pc.id}" data-emp="${e.id}" aria-label="Quitar a ${esc(nombreEmpleado(e))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>` : ""}</span>`).join("") || `<span class="vacio">Sin integrantes.</span>`}</div>
        ${esAdmin ? `<form class="filtros pc-agregar" data-pc-form="${pc.id}" style="margin:12px 0 0">
          <div style="flex:1; min-width:220px"><label>Agregar integrante</label><select required>${app().opcionesEmpleados(null, { vacia: "Elegí un empleado" }).replace(/<option value="(\d+)"[^>]*>[^<]*<\/option>/g, (m, id) => yaEstan.has(Number(id)) ? "" : m)}</select></div>
          <button class="btn-sec" type="submit">Agregar</button>
        </form>` : ""}
        <h2 style="margin-top:18px">Próximas vacaciones${info("Vacaciones cargadas de los integrantes que todavía no terminaron. Si alguna aparece como \"Se superpone\", se cargó antes de armar el grupo.")}</h2>
        <div class="tabla-wrap"><table class="tabla grilla"><thead><tr><th>Empleado</th><th>Desde</th><th>Hasta</th><th class="num">Días</th><th></th></tr></thead>
          <tbody>${filas || `<tr><td colspan="5" class="vacio">No hay vacaciones cargadas a futuro.</td></tr>`}</tbody></table></div>
      </div>`;
    }).join("");
  }

  async function ejecutar(promesa, ok) {
    try { await promesa; if (ok) toast(ok); }
    catch (e) { toast(e.message, "error", 6000); }
    mostrar();
  }

  function iniciar() {
    $("pc-nuevo").addEventListener("click", async () => {
      const r = await R.util.formulario({ titulo: "Nuevo puesto compartido", aceptar: "Crear",
        texto: "Después vas a poder agregar a las personas que se cubren entre sí.",
        campos: [{ nombre: "nombre", etiqueta: "Nombre", requerido: true, ayuda: "Ej.: Sistemas, Caja de Central, Depósito." },
                 { nombre: "descripcion", etiqueta: "Descripción (opcional)" }] });
      if (!r || !r.nombre) return;
      ejecutar(R.api.compartidos.crear(r.nombre, r.descripcion), "Puesto compartido creado. Ahora agregá a sus integrantes.");
    });
    $("pc-lista").addEventListener("submit", e => {
      const f = e.target.closest("[data-pc-form]");
      if (!f) return;
      e.preventDefault();
      const id = Number(f.dataset.pcForm), emp = Number(f.querySelector("select").value);
      if (emp) ejecutar(R.api.compartidos.agregar(id, emp), "Integrante agregado.");
    });
    $("pc-lista").addEventListener("click", async e => {
      const b = e.target.closest("button");
      if (b && b.dataset.pcQuitar) {
        const e2 = app().empleado(Number(b.dataset.emp));
        if (await R.util.confirmar(`¿Quitar a ${nombreEmpleado(e2)} de este puesto compartido?`)) ejecutar(R.api.compartidos.quitar(Number(b.dataset.pcQuitar), e2.id), "Integrante quitado.");
        return;
      }
      if (b && b.dataset.pcRenombrar) {
        const pc = R.estado.compartidos.find(x => x.id === Number(b.dataset.pcRenombrar));
        const nombre = await R.util.pedir("Renombrar puesto compartido", pc.nombre, { etiqueta: "Nombre" });
        if (nombre && nombre.trim() && nombre.trim() !== pc.nombre) ejecutar(R.api.compartidos.actualizar(pc.id, { nombre: nombre.trim() }), "Renombrado.");
        return;
      }
      if (b && b.dataset.pcEliminar) {
        const pc = R.estado.compartidos.find(x => x.id === Number(b.dataset.pcEliminar));
        if (await R.util.confirmar(`¿Eliminar el puesto compartido "${pc.nombre}"? Sus integrantes van a poder tomarse vacaciones a la vez.`)) ejecutar(R.api.compartidos.eliminar(pc.id), "Puesto compartido eliminado.");
        return;
      }
      const fila = e.target.closest("[data-empleado]");
      if (fila) R.vistaFicha.abrir(Number(fila.dataset.empleado));
    });
  }

  R.vistaCompartidos = { iniciar, mostrar };
})(window.RRHH);
