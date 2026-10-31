// =====================================================================
//  Vista: Empleados (lista, búsqueda y alta/edición — esto último solo admin).
// =====================================================================
(function (R) {
  const { $, esc, norm, hoy, fmtFecha, nombreEmpleado, toast } = R.util;
  const app = () => R.app;
  let editando = null;

  function mostrar() {
    const estado = $("empleados-estado").value;
    const q = norm($("empleados-buscar").value);
    const lista = app().empleadosVisibles({ inactivos: true })
      .filter(e => estado === "todos" || (estado === "activos" ? e.activo : !e.activo))
      .filter(e => !q || norm([e.apellido, e.nombre, e.legajo, e.dni, e.cuil, e.puesto, e.sector].join(" ")).includes(q));
    const activos = app().empleadosVisibles().length;
    $("empleados-sub").textContent = `${app().textoSucursal()} · ${activos} ${activos === 1 ? "activo" : "activos"}`;
    const hoyISO = hoy(), esAdmin = app().esAdmin();
    $("tabla-empleados").innerHTML = `<thead><tr><th>Empleado</th><th>Legajo</th><th>Sucursal</th><th>Puesto</th><th>Sector</th><th>Ingreso</th><th>Antigüedad</th><th>DNI</th>${esAdmin ? "<th></th>" : ""}</tr></thead>
      <tbody>${lista.map(e => `
        <tr class="clic${e.activo ? "" : " inactivo"}" data-empleado="${e.id}">
          <td>${esc(nombreEmpleado(e))}${e.activo ? "" : `<small>De baja${e.fecha_egreso ? " desde " + fmtFecha(e.fecha_egreso) : ""}</small>`}</td>
          <td>${esc(e.legajo) || "—"}</td>
          <td>${esc(app().sucursalNombre(e.sucursal_id))}</td>
          <td>${esc(e.puesto) || "—"}</td>
          <td>${esc(e.sector) || "—"}</td>
          <td>${fmtFecha(e.fecha_ingreso)}</td>
          <td>${esc(R.calc.antiguedad(e.fecha_ingreso, hoyISO))}</td>
          <td>${esc(e.dni) || "—"}</td>
          ${esAdmin ? `<td><div class="acciones-fila"><button type="button" class="link" data-editar="${e.id}">Editar</button></div></td>` : ""}
        </tr>`).join("") || `<tr><td colspan="9" class="vacio">No hay empleados con ese filtro.</td></tr>`}</tbody>`;
  }

  // Fecha y motivo de baja solo si no está activo
  function mostrarBaja() {
    document.querySelectorAll("#form-empleado .baja-campos").forEach(el => { el.hidden = $("em-activo").checked; });
  }

  function abrirFormulario(id = null) {
    editando = id;
    const e = id ? app().empleado(id) : null;
    $("dlg-empleado-titulo").textContent = e ? `Editar · ${nombreEmpleado(e)}` : "Nuevo empleado";
    $("em-sucursal").innerHTML = R.estado.sucursales.filter(s => s.activa || (e && s.id === e.sucursal_id))
      .map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
    const v = e || { activo: true, sucursal_id: Number(R.estado.filtroSucursal) || (R.estado.sucursales[0] || {}).id };
    $("em-apellido").value = v.apellido || "";
    $("em-nombre").value = v.nombre || "";
    $("em-dni").value = v.dni || "";
    $("em-cuil").value = v.cuil || "";
    $("em-sucursal").value = v.sucursal_id || "";
    // Puestos activos (y el actual aunque esté desactivado, para no perderlo al guardar)
    $("em-puesto").innerHTML = `<option value="">Sin puesto</option>` + R.estado.puestos
      .filter(p => p.activo || p.nombre === v.puesto)
      .map(p => `<option value="${esc(p.nombre)}">${esc(p.nombre)}</option>`).join("");
    $("em-puesto").value = v.puesto || "";
    $("em-jornada").value = v.jornada_horas ?? "";
    $("em-telefono").value = v.telefono || "";
    $("em-ingreso").value = v.fecha_ingreso || "";
    $("em-egreso").value = v.fecha_egreso || "";
    $("em-activo").checked = v.activo !== false;
    $("em-notas").value = v.notas || "";
    $("em-legajo").value = v.legajo || "";
    $("em-sector").value = v.sector || "";
    $("em-entrada").value = (v.hora_entrada || "").slice(0, 5);
    $("em-salida").value = (v.hora_salida || "").slice(0, 5);
    $("em-min-entrada").value = v.extra_entrada_min ?? "";
    $("em-min-salida").value = v.extra_salida_min ?? "";
    $("em-nacimiento").value = v.fecha_nacimiento || "";
    $("em-email").value = v.email || "";
    $("em-direccion").value = v.direccion || "";
    $("em-obra").value = v.obra_social || "";
    $("em-banco").value = v.banco || "";
    $("em-ce-nombre").value = v.contacto_emergencia_nombre || "";
    $("em-ce-tel").value = v.contacto_emergencia_tel || "";
    $("em-motivo").value = v.motivo_baja || "";
    // Sugerencias con lo que ya está cargado
    const opciones = campo => [...new Set(R.estado.empleados.map(x => (x[campo] || "").trim()).filter(Boolean))].sort()
      .map(x => `<option value="${esc(x)}">`).join("");
    $("lista-sectores").innerHTML = opciones("sector");
    $("lista-obras").innerHTML = opciones("obra_social");
    $("lista-bancos").innerHTML = opciones("banco");
    mostrarBaja();
    $("empleado-error").textContent = "";
    $("dlg-empleado").showModal();
    $("em-apellido").focus();
  }

  async function guardar(ev) {
    ev.preventDefault();
    $("empleado-error").textContent = "";
    const d = {
      apellido: $("em-apellido").value, nombre: $("em-nombre").value,
      dni: $("em-dni").value.replace(/\D/g, ""), cuil: $("em-cuil").value,
      sucursal_id: Number($("em-sucursal").value), puesto: $("em-puesto").value,
      jornada_horas: $("em-jornada").value, telefono: $("em-telefono").value,
      fecha_ingreso: $("em-ingreso").value, fecha_egreso: $("em-egreso").value,
      activo: $("em-activo").checked, notas: $("em-notas").value,
      legajo: $("em-legajo").value.toUpperCase(), sector: $("em-sector").value, hora_entrada: $("em-entrada").value,
      hora_salida: $("em-salida").value, extra_entrada_min: $("em-min-entrada").value, extra_salida_min: $("em-min-salida").value,
      fecha_nacimiento: $("em-nacimiento").value, email: $("em-email").value, direccion: $("em-direccion").value,
      obra_social: $("em-obra").value, banco: $("em-banco").value,
      contacto_emergencia_nombre: $("em-ce-nombre").value, contacto_emergencia_tel: $("em-ce-tel").value,
      motivo_baja: $("em-activo").checked ? "" : $("em-motivo").value,
    };
    if (!d.activo && !d.motivo_baja.trim()) return ($("empleado-error").textContent = "Indicá el motivo de la baja.");
    if (!d.activo && !d.fecha_egreso) d.fecha_egreso = hoy();
    $("em-guardar").disabled = true;
    try {
      if (editando) await R.api.empleados.actualizar(editando, d);
      else await R.api.empleados.crear(d);
      await app().recargarEmpleados();
      $("dlg-empleado").close();
      // Si quedó en una sucursal que no se está mostrando, avisarlo (si no, parece que desapareció)
      const f = R.estado.filtroSucursal;
      const otraSucursal = f && Number(f) !== d.sucursal_id ? ` Pasó a ${app().sucursalNombre(d.sucursal_id)}: elegí esa sucursal arriba para verlo.` : "";
      toast((editando ? "Empleado actualizado." : "Empleado cargado.") + otraSucursal, "ok", otraSucursal ? 6000 : 3500);
      app().refrescar();
      R.vistaFicha.refrescarSiAbierta();
    } catch (err) {
      $("empleado-error").textContent = err.message;
    } finally { $("em-guardar").disabled = false; }
  }

  function iniciar() {
    $("empleados-buscar").addEventListener("input", mostrar);
    $("empleados-estado").addEventListener("change", mostrar);
    $("nuevo-empleado").addEventListener("click", () => abrirFormulario());
    $("form-empleado").addEventListener("submit", guardar);
    $("em-activo").addEventListener("change", mostrarBaja);
    $("tabla-empleados").addEventListener("click", e => {
      const editar = e.target.closest("[data-editar]");
      if (editar) return abrirFormulario(Number(editar.dataset.editar));
      const fila = e.target.closest("[data-empleado]");
      if (fila) R.vistaFicha.abrir(Number(fila.dataset.empleado));
    });
  }

  R.vistaEmpleados = { iniciar, mostrar, abrirFormulario };
})(window.RRHH);
