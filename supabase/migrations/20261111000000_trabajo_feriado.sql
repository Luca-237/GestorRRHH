-- =====================================================================
--  Novedad nueva "Trabajó un feriado": solo deja el registro (fecha y
--  observación) para que figure en la planilla que se envía al gestor de
--  RRHH. No cuenta horas, ni días, ni plata, y no es una ausencia.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('trabajo_feriado', 'Trabajó un feriado', 'registro', false, false, '#b8860b', 16, false, 0, false)
on conflict (clave) do nothing;

-- Control
select count(*) as tipo_trabajo_feriado from public.tipos_novedad where clave = 'trabajo_feriado';
