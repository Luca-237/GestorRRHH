// =====================================================================
//  Billetera de horas (dentro de Cuenta de horas). Las horas que se cargan a la
//  billetera son horas a favor del empleado, en dos saldos: al 50% y al 100%
//  (no se mezclan). Se usan para lo que haga falta, siempre con el mismo botón:
//    · Cobrarlas en el sueldo: pasan a "Pendientes de liquidar" (Horas extra), con su recargo.
//    · Tiempo libre: un permiso o un día que se toma con esas horas.
//    · Cubrir horas que debe: además baja la deuda de la cuenta de horas.
//    · Otro uso: cualquier otro fin, con su detalle.
//  Se gastan primero las horas más viejas y cada uso queda registrado como
//  novedad "Uso de horas del banco" (así la ficha arma el resumen con saldo).
//  Una carga es una novedad de horas extra con banco = true (ver R.calc.bancoHoras).
// =====================================================================
(function (R) {
  const { $, esc, hoy, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  const fmtH = h => R.calc.fmtHoras(h);
  const redondear = n => Math.round(n * 100) / 100;
  let depositos = [];          // todas las cargas visibles
  let empleadoId = null;

  const delEmpleado = id => depositos.filter(n => n.empleado_id === id);
  const paraElegido = () => (document.querySelector('input[name="banco-para"]:checked') || {}).value || "cobrar";
  const TEXTO_PARA = { cobrar: "Cobro en el sueldo", libre: "Tiempo libre", deuda: "Para cubrir horas que debe", otro: "Otro uso" };

  async function mostrar() {
    $("tabla-banco").innerHTML = R.util.esqueleto.tabla(5, 3);
    try { depositos = (await R.api.novedades.bancoHoras()).filter(n => app().esVisible(n.empleado_id)); }
    catch (e) { depositos = []; $("tabla-banco").innerHTML = ""; $("banco-resumen").textContent = ""; return toast(e.message, "error", 6000); }

    const porEmpleado = new Map();
    depositos.forEach(n => { if (!porEmpleado.has(n.empleado_id)) porEmpleado.set(n.empleado_id, []); porEmpleado.get(n.empleado_id).push(n); });
    const filas = [...porEmpleado.entries()].map(([id, l]) => ({ e: app().empleado(id), id, b: R.calc.bancoHoras(l) }))
      .filter(f => f.b.total > 0.005).sort((a, b) => b.b.total - a.b.total);
    const total = filas.reduce((a, f) => a + f.b.total, 0), t50 = filas.reduce((a, f) => a + f.b.h50, 0), t100 = filas.reduce((a, f) => a + f.b.h100, 0);
    $("banco-resumen").textContent = filas.length ? `${fmtH(total)} en la billetera de ${filas.length} ${filas.length === 1 ? "empleado" : "empleados"} · al 50%: ${fmtH(t50)} · al 100%: ${fmtH(t100)}` : "";
    const conSucursal = !R.estado.filtroSucursal;
    $("tabla-banco").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Horas al 50%${info("Horas de días comunes. Se llevan aparte de las del 100%.")}</th>
      <th class="num">Horas al 100%${info("Horas de sábados desde las 13, domingos y feriados.")}</th>
      <th class="num">Saldo total</th><th></th></tr></thead>
      <tbody>${filas.map(({ e, id, b }) => `<tr>
        <td class="clic" data-ficha="${id}" style="cursor:pointer">${esc(nombreEmpleado(e))}<small>${esc(e ? e.puesto || "" : "")}</small></td>
        ${conSucursal ? `<td>${esc(app().sucursalNombre(e && e.sucursal_id))}</td>` : ""}
        <td class="num a-favor${b.h50 ? "" : " cero"}">${b.h50 ? esc(fmtH(b.h50)) : "0"}</td>
        <td class="num a-favor${b.h100 ? "" : " cero"}">${b.h100 ? esc(fmtH(b.h100)) : "0"}</td>
        <td class="num"><strong>${esc(fmtH(b.total))}</strong></td>
        <td><div class="acciones-fila"><button type="button" class="btn-sec" data-banco-usar="${id}">Usar horas</button><button type="button" class="link" data-ficha="${id}">Movimientos</button></div></td>
      </tr>`).join("") || `<tr><td colspan="${conSucursal ? 6 : 5}" class="vacio">Nadie tiene horas en la billetera. Usá "Cargar horas a la billetera" para sumar horas a favor.</td></tr>`}</tbody>`;
  }

  // ---------- Usar horas ----------
  function actualizar() {
    const b = R.calc.bancoHoras(delEmpleado(empleadoId));
    const recargo = Number($("banco-recargo").value), disp = recargo === 100 ? b.h100 : b.h50;
    const horas = Number($("banco-horas").value) || 0;
    $("banco-info").innerHTML = `En la billetera: <strong>${esc(fmtH(b.h50))}</strong> al 50% · <strong>${esc(fmtH(b.h100))}</strong> al 100%.` +
      (horas > 0 ? ` Después de usar ${esc(fmtH(horas))} al ${recargo}% quedan <strong>${esc(fmtH(Math.max(0, disp - horas)))}</strong> al ${recargo}%.` : "");
    $("banco-obs").placeholder = paraElegido() === "otro" ? "Contá para qué se usan (obligatorio)" : "Opcional";
    $("banco-obs-label").textContent = paraElegido() === "otro" ? "Detalle (obligatorio)" : "Detalle";
  }

  function abrir(id) {
    empleadoId = id;
    const e = app().empleado(id), b = R.calc.bancoHoras(delEmpleado(id));
    $("banco-titulo").textContent = `Usar horas de la billetera · ${nombreEmpleado(e)}`;
    $("banco-recargo").value = b.h50 >= b.h100 ? "50" : "100";
    $("banco-horas").value = "";
    document.querySelector('input[name="banco-para"][value="cobrar"]').checked = true;
    $("banco-fecha").value = hoy();
    $("banco-obs").value = "";
    $("banco-error").textContent = "";
    actualizar();
    $("dlg-banco").showModal();
    $("banco-horas").focus();
  }

  async function guardar(ev) {
    ev.preventDefault();
    $("banco-error").textContent = "";
    const recargo = Number($("banco-recargo").value), horas = Number($("banco-horas").value), para = paraElegido(), obs = $("banco-obs").value.trim();
    if (!(horas > 0)) return ($("banco-error").textContent = "Indicá cuántas horas.");
    if (para === "otro" && !obs) return ($("banco-error").textContent = "Contá para qué se usan las horas.");
    const { tomas, faltan } = R.calc.repartirBanco(delEmpleado(empleadoId), recargo, horas);
    if (faltan > 0.005) return ($("banco-error").textContent = `Solo hay ${fmtH(horas - faltan)} al ${recargo}% en la billetera.`);
    const fecha = $("banco-fecha").value || hoy();
    $("banco-guardar").disabled = true;
    try {
      // Cada carga anota cuánto se usó; lo usado se resta de la billetera
      for (const t of tomas) {
        const nuevo = t.toma >= t.rem - 0.005 ? Number(t.dep.cantidad) : redondear((Number(t.dep.banco_usado) || 0) + t.toma);
        await R.api.novedades.actualizar(t.dep.id, { banco_usado: nuevo });
      }
      if (para === "cobrar") {
        // Para cobrar, esas horas nacen como horas extra pendientes de liquidar (con su fecha y recargo)
        for (const t of tomas) {
          await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "horas_extra", fecha_desde: t.dep.fecha_desde, cantidad: redondear(t.toma),
            recargo, banco: false, observacion: "Pasadas desde la billetera de horas" });
        }
      }
      await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "banco_uso", fecha_desde: fecha, cantidad: horas,
        observacion: [`${TEXTO_PARA[para]} (horas al ${recargo}%)`, obs].filter(Boolean).join(" — ") });
      // Si se usan para cubrir lo que debe, también se registra la devolución (baja la deuda de la cuenta de horas)
      if (para === "deuda") await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "devolucion_horas", fecha_desde: fecha, cantidad: horas, observacion: "Cubierta con horas de la billetera" });
      toast(para === "cobrar" ? `${fmtH(horas)} al ${recargo}% pasaron a Pendientes de liquidar (Horas extra).`
        : `Se usaron ${fmtH(horas)}${para === "deuda" ? " y se descontaron de lo que debe" : ""}.`);
      $("dlg-banco").close();
      mostrar();
      if (R.vistaFicha.refrescarSiAbierta) R.vistaFicha.refrescarSiAbierta();
    } catch (err) { $("banco-error").textContent = err.message; mostrar(); }
    finally { $("banco-guardar").disabled = false; }
  }

  function iniciar() {
    $("form-banco").addEventListener("submit", guardar);
    $("banco-recargo").addEventListener("change", actualizar);
    $("banco-horas").addEventListener("input", actualizar);
    $("banco-para").addEventListener("change", actualizar);
    $("banco-todas").addEventListener("click", () => {
      const b = R.calc.bancoHoras(delEmpleado(empleadoId));
      $("banco-horas").value = Number($("banco-recargo").value) === 100 ? b.h100 : b.h50;
      actualizar();
    });
    $("caja-banco").addEventListener("click", e => {
      if (e.target.closest("#banco-nuevo")) return R.vistaNovedades.abrirFormulario({ tipo: "horas_extra", interno: true });
      const u = e.target.closest("[data-banco-usar]"), f = e.target.closest("[data-ficha]");
      if (u) abrir(Number(u.dataset.bancoUsar));
      else if (f) R.vistaFicha.abrir(Number(f.dataset.ficha));
    });
  }

  R.banco = { iniciar, mostrar };
})(window.RRHH);
