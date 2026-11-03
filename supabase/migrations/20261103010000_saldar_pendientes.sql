-- =====================================================================
--  Deja en cero lo pendiente de liquidar y de descontar:
--     · Horas extra sin liquidar ................ pasan a liquidadas en octubre 2026
--     · Adelantos y compras en cuenta corriente
--       sin descontar ........................... pasan a descontados en el sueldo de octubre 2026
--     · Vacaciones tomadas sin liquidar ........... pasan a liquidadas el 31/10/2026
--  No borra nada: solo completa el campo "liquidado en". Se puede volver a
--  correr (no hay más pendientes, no cambia nada).
--  Ojo: las compras en cuenta corriente que se importaron de la planilla de
--  saldos también quedan como descontadas.
-- =====================================================================
begin;

update public.novedades set liquidado_en = date '2026-10-01'
where tipo = 'horas_extra' and liquidado_en is null;

update public.novedades n set liquidado_en = date '2026-10-01'
from public.tipos_novedad t
where t.clave = n.tipo and t.descuenta_sueldo and n.liquidado_en is null;

update public.novedades n set liquidado_en = date '2026-10-31'
from public.tipos_novedad t
where t.clave = n.tipo and t.descuenta_vacaciones and n.liquidado_en is null;

commit;

-- Control: todo en 0
select
  (select count(*) from public.novedades where tipo = 'horas_extra' and liquidado_en is null) as horas_extra_sin_liquidar,
  (select count(*) from public.novedades n join public.tipos_novedad t on t.clave = n.tipo
     where t.descuenta_sueldo and n.liquidado_en is null)                                      as descuentos_sin_descontar,
  (select count(*) from public.novedades n join public.tipos_novedad t on t.clave = n.tipo
     where t.descuenta_vacaciones and n.liquidado_en is null)                                  as vacaciones_sin_liquidar;
