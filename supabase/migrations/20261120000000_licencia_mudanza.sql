-- =====================================================================
--  Novedad nueva "Licencia por mudanza" (pedido de Luca, 20/11/2026).
--  Se carga en días (desde/hasta), cuenta como ausencia (aparece en el
--  calendario, en "Hoy no están" y en la planilla), no descuenta
--  vacaciones ni toca la cuenta de horas ni el sueldo.
--  Se puede correr antes o después de desplegar. Se puede volver a correr.
-- =====================================================================
insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('licencia_mudanza', 'Licencia por mudanza', 'dias', false, true, '#4a7c59', 9, false, 0, false)
on conflict (clave) do nothing;

select clave, nombre, unidad, es_ausencia, activo from public.tipos_novedad where clave = 'licencia_mudanza';
