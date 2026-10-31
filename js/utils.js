window.RRHH = window.RRHH || {};

(function (R) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Para comparar/buscar: sin tildes, mayúsculas, sin espacios extremos
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

  // Usuario <-> email de login. "Antonella" -> "antonella@rrhh.cindymayorista.com.ar";
  // si ya escribieron un email completo, se respeta.
  const dominioUsuarios = () => ((window.RRHH_CONFIG || {}).dominioUsuarios || "rrhh.local").toLowerCase();
  const aEmail = u => {
    const s = String(u || "").trim().toLowerCase();
    return s.includes("@") ? s : `${s}@${dominioUsuarios()}`;
  };
  const aUsuario = email => {
    const s = String(email || "").toLowerCase(), sufijo = "@" + dominioUsuarios();
    return s.endsWith(sufijo) ? s.slice(0, -sufijo.length) : s;
  };

  // ---------- Fechas ----------
  // Se trabaja siempre con texto "AAAA-MM-DD" y Date en UTC, para que el
  // huso horario nunca corra un día.
  const DIA = 86400000;
  const aFecha = iso => new Date(iso + "T00:00:00Z");
  const aISO = d => d.toISOString().slice(0, 10);
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const mesActual = () => hoy().slice(0, 7);
  const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * DIA));
  const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / DIA) + 1; // inclusive
  // Días en común entre [desde, hasta] y [rDesde, rHasta] (0 si no se tocan)
  function solapamiento(desde, hasta, rDesde, rHasta) {
    const a = desde > rDesde ? desde : rDesde;
    const b = hasta < rHasta ? hasta : rHasta;
    return a > b ? 0 : diasEntre(a, b);
  }
  function rangoMes(mes) { // "2026-10"
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
  }
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mesTexto = mes => { const [a, m] = mes.split("-"); return `${MESES[Number(m) - 1]} ${a}`; };
  const fmtFecha = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
  const fmtCorta = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
  const fmtNum = (n, dec = 0) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
  // 95 min -> "1 h 35 min"
  function fmtMinutos(min) {
    min = Math.round(min || 0);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  const nombreEmpleado = e => e ? [e.apellido, e.nombre].filter(Boolean).join(", ") : "(empleado borrado)";

  let timerToast;
  function toast(mensaje, tipo = "ok", ms = 3500) {
    const el = $("toast");
    el.textContent = mensaje;
    el.classList.toggle("error", tipo === "error");
    el.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { el.hidden = true; }, ms);
  }

  // CSV para Excel en español: separador ";" y BOM para que respete las tildes
  function descargarCSV(nombreArchivo, filas) {
    const celda = v => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const texto = "﻿" + filas.map(f => f.map(celda).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Cierra cualquier diálogo con los botones [data-cerrar]
  function iniciarDialogos() {
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-cerrar]");
      if (b) b.closest("dialog").close();
    });
  }

  // Íconos de interfaz (Lucide, SVG en línea; nunca emojis)
  const ICONOS = {
    alerta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  // ---------- Ayudas "i" ----------
  // Ícono que muestra una explicación mientras el mouse está encima (o tiene el foco con el teclado).
  // En el HTML fijo se escribe a mano: <span class="info" tabindex="0" data-info="…"></span>
  const info = texto => `<span class="info" tabindex="0" role="img" aria-label="${esc(texto)}" data-info="${esc(texto)}"></span>`;

  function iniciarAyudas() {
    const globo = document.createElement("div");
    globo.className = "globo-info";
    globo.setAttribute("role", "tooltip");
    globo.hidden = true;
    let actual = null;

    function mostrar(el) {
      actual = el;
      // Dentro de un diálogo abierto el globo tiene que ir adentro, si no queda tapado
      (el.closest("dialog[open]") || document.body).appendChild(globo);
      globo.textContent = el.dataset.info;
      globo.hidden = false;
      const r = el.getBoundingClientRect(), g = globo.getBoundingClientRect(), m = 8;
      let left = r.left + r.width / 2 - g.width / 2;
      left = Math.max(m, Math.min(left, window.innerWidth - g.width - m));
      let top = r.top - g.height - 8;
      if (top < m) top = r.bottom + 8; // sin lugar arriba: va abajo
      globo.style.left = `${left}px`;
      globo.style.top = `${top}px`;
    }
    function ocultar() { actual = null; globo.hidden = true; }

    document.addEventListener("mouseover", e => {
      const el = e.target.closest("[data-info]");
      if (el && el !== actual) mostrar(el);
    });
    document.addEventListener("mouseout", e => {
      const el = e.target.closest("[data-info]");
      if (el && el === actual && !el.contains(e.relatedTarget)) ocultar();
    });
    // Con el teclado (Tab) también se puede leer
    document.addEventListener("focusin", e => { if (e.target.matches("[data-info]:focus-visible")) mostrar(e.target); });
    document.addEventListener("focusout", e => { if (e.target === actual) ocultar(); });
    // Si la página o una tabla se mueve, el globo quedaría en el aire
    document.addEventListener("scroll", () => { if (actual) ocultar(); }, true);
    // Que tocar la "i" no abra la fila o el diálogo donde está
    document.addEventListener("click", e => { if (e.target.closest(".info[data-info], .marca-revisar")) e.stopPropagation(); }, true);
  }

  // ---------- Diálogos propios (en vez de confirm/prompt del navegador) ----------
  // confirm() y prompt() nativos se ven distinto en cada navegador y algunos los
  // bloquean sin avisar; estos usan el mismo estilo de la app y devuelven una promesa.
  let dlgPregunta = null;
  function armarDialogo() {
    if (dlgPregunta) return dlgPregunta;
    dlgPregunta = document.createElement("dialog");
    dlgPregunta.className = "dlg dlg-pregunta";
    dlgPregunta.innerHTML = `<form method="dialog">
      <div class="dlg-head"><h3></h3></div>
      <div class="dlg-body"><p class="pregunta-texto"></p><div class="pregunta-campos"></div>
        <div class="mensaje-error" role="alert"></div>
        <div class="dlg-pie"><button type="button" class="btn-sec" value="no">Cancelar</button><button type="submit" class="btn-sec primario" value="si">Aceptar</button></div></div>
    </form>`;
    document.body.appendChild(dlgPregunta);
    return dlgPregunta;
  }

  // campos: [{ nombre, etiqueta, valor, tipo, requerido, min, ayuda }] → { nombre: valor } o null si cancela
  function formulario({ titulo, texto = "", campos = [], aceptar = "Aceptar", peligro = false }) {
    const d = armarDialogo();
    // Si hay otro diálogo abierto, el nuevo va adentro para quedar arriba
    (document.querySelector("dialog[open]:not(.dlg-pregunta)") || document.body).appendChild(d);
    d.querySelector("h3").textContent = titulo;
    d.querySelector(".pregunta-texto").textContent = texto;
    d.querySelector(".pregunta-texto").hidden = !texto;
    d.querySelector(".mensaje-error").textContent = "";
    d.querySelector(".pregunta-campos").innerHTML = campos.map((c, i) => `<label for="preg-${i}">${esc(c.etiqueta)}</label>
      <input id="preg-${i}" name="${esc(c.nombre)}" type="${c.tipo || "text"}" value="${esc(c.valor ?? "")}" ${c.requerido ? "required" : ""} ${c.min ? `minlength="${c.min}"` : ""} autocomplete="off">
      ${c.ayuda ? `<div class="hint">${esc(c.ayuda)}</div>` : ""}`).join("");
    const ok = d.querySelector('button[value="si"]');
    ok.textContent = aceptar;
    ok.classList.toggle("peligro", peligro);
    return new Promise(resolver => {
      const cancelar = d.querySelector('button[value="no"]');
      const terminar = valor => { d.close(); form.onsubmit = null; cancelar.onclick = null; d.oncancel = null; resolver(valor); };
      const form = d.querySelector("form");
      form.onsubmit = e => {
        e.preventDefault();
        const datos = {};
        campos.forEach((c, i) => { datos[c.nombre] = d.querySelector(`#preg-${i}`).value.trim(); });
        terminar(datos);
      };
      cancelar.onclick = () => terminar(null);
      d.oncancel = e => { e.preventDefault(); terminar(null); };
      d.showModal();
      (d.querySelector(".pregunta-campos input") || ok).focus();
    });
  }
  const confirmar = (texto, { titulo = "Confirmar", aceptar = "Aceptar", peligro = false } = {}) =>
    formulario({ titulo, texto, aceptar, peligro }).then(r => r !== null);
  const pedir = (titulo, valor = "", { etiqueta = titulo, tipo = "text", min, ayuda } = {}) =>
    formulario({ titulo, campos: [{ nombre: "valor", etiqueta, valor, tipo, min, ayuda, requerido: true }] }).then(r => r ? r.valor : null);

  // ---------- Esqueletos de carga ----------
  // Mientras llegan los datos se muestra la forma de lo que va a aparecer (barras grises
  // con un brillo suave) en vez de "Cargando…". Los anchos varían para que no se vea plano.
  const ANCHOS = [72, 48, 86, 60, 40, 78, 54, 66, 90, 45];
  const barra = (ancho, alto = 12, extra = "") => `<span class="esq" style="width:${ancho}${typeof ancho === "number" ? "%" : ""}; height:${alto}px${extra}"></span>`;
  const aviso = `<span class="sr-only">Cargando…</span>`;
  const esqueleto = {
    kpis(n = 4) {
      return aviso + Array.from({ length: n }, (_, i) => `<div class="kpi" aria-hidden="true">${barra(55 + (i % 3) * 10, 10)}${barra(38, 28, "; margin-top:12px")}${barra(70 - (i % 2) * 15, 10, "; margin-top:10px")}${barra(40, 10, "; margin-top:6px")}</div>`).join("");
    },
    // Solo filas (para un <tbody> que ya tiene encabezado)
    filas(cols, n = 6) {
      return Array.from({ length: n }, (_, f) => `<tr class="esq-fila" aria-hidden="true">${Array.from({ length: cols }, (_, c) =>
        `<td>${c === 0 ? barra(ANCHOS[f % 10], 12) + barra(40, 9, "; margin-top:6px") : barra(ANCHOS[(f + c) % 10] - 10, 12)}</td>`).join("")}</tr>`).join("");
    },
    // Tabla completa: encabezado + filas
    tabla(cols, n = 6) {
      return `<thead><tr>${Array.from({ length: cols }, (_, c) => `<th>${barra(c === 0 ? 50 : 70, 9)}</th>`).join("")}</tr></thead><tbody>${esqueleto.filas(cols, n)}</tbody>`;
    },
    lista(n = 3) {
      return Array.from({ length: n }, (_, i) => `<li aria-hidden="true"><span style="flex:1">${barra(ANCHOS[i] - 15, 12)}${barra(35, 9, "; margin-top:6px")}</span>${barra(70, 18, "; max-width:90px; border-radius:999px")}</li>`).join("");
    },
    calendario() {
      const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      // [fila, columna, largo] de algunos rectángulos de mentira por semana
      const piezas = [[[2, 1, 3], [3, 4, 2]], [[2, 2, 2], [3, 5, 3]], [[2, 1, 1], [2, 4, 4]], [[2, 3, 2]], [[2, 6, 2], [3, 1, 3]]];
      const semana = bs => `<div class="cal-semana" style="--carriles:3">${Array.from({ length: 7 }, (_, c) =>
        `<div class="cal-dia" style="grid-column:${c + 1}" aria-hidden="true"><div class="cal-num">${barra("18px", 12)}</div></div>`).join("")}${bs.map(([f, c, l]) =>
        `<div aria-hidden="true" style="grid-row:${f}; grid-column:${c} / span ${l}; padding:0 3px; align-self:center">${barra(100, 18, "; border-radius:6px")}</div>`).join("")}</div>`;
      return aviso + `<div class="cal-cabecera">${dias.map(d => `<div>${d}</div>`).join("")}</div><div class="cal-mes">${piezas.map(semana).join("")}</div>`;
    },
    ficha() {
      return aviso + `<div aria-hidden="true"><dl class="ficha-datos">${Array.from({ length: 12 }, (_, i) => `<div><dt>${barra(45, 9)}</dt><dd>${barra(ANCHOS[i % 10], 13, "; margin-top:6px")}</dd></div>`).join("")}</dl>
        <div class="kpis" style="margin-top:8px">${esqueleto.kpis(4).replace(aviso, "")}</div>
        <div class="tabla-wrap" style="margin-top:14px"><table class="tabla grilla">${esqueleto.tabla(4, 5)}</table></div></div>`;
    },
    cajas(n = 2) {
      return aviso + Array.from({ length: n }, () => `<div class="caja" aria-hidden="true">${barra(30, 18)}${barra(55, 10, "; margin-top:10px")}
        <div style="display:flex; gap:8px; margin:18px 0">${barra("150px", 30, "; border-radius:999px")}${barra("130px", 30, "; border-radius:999px")}</div>
        <div class="tabla-wrap"><table class="tabla grilla">${esqueleto.tabla(5, 3)}</table></div></div>`).join("");
    },
  };

  R.util = {
    $, esc, norm, aEmail, aUsuario, hoy, mesActual, aFecha, aISO, sumarDias, diasEntre, solapamiento,
    rangoMes, mesTexto, fmtFecha, fmtCorta, fmtNum, fmtMinutos, nombreEmpleado, toast, descargarCSV,
    iniciarDialogos, info, iniciarAyudas, ICONOS, esqueleto, confirmar, pedir, formulario,
  };
})(window.RRHH);
