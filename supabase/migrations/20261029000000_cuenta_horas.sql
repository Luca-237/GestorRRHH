-- =====================================================================
--  Cuenta corriente de horas: lo que cada empleado debe por permisos o
--  días pedidos, y lo que va devolviendo trabajando horas de más.
--  Cada tipo de novedad dice si mueve la cuenta:
--     1 = suma a la deuda   ·   -1 = descuenta de la deuda   ·   0 = no la toca
--  Las horas se calculan: horas → tal cual · minutos → /60 · días → × jornada
--  del empleado (8 si no tiene jornada cargada).
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.tipos_novedad add column if not exists cuenta_horas smallint not null default 0;
alter table public.tipos_novedad drop constraint if exists tipos_novedad_cuenta_horas_check;
alter table public.tipos_novedad add constraint tipos_novedad_cuenta_horas_check check (cuenta_horas in (-1, 0, 1));

insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas) values
  ('permiso_horas',    'Permiso de horas (a devolver)', 'horas', false, false, '#7a4a2a', 8,  true,  1),
  ('dia_a_devolver',   'Día pedido (a devolver)',       'dias',  false, true,  '#a0522d', 9,  true,  1),
  ('devolucion_horas', 'Devolución de horas',           'horas', false, false, '#2f6b3a', 10, true, -1)
on conflict (clave) do nothing;

commit;

-- Control: tipos que mueven la cuenta de horas
select clave, nombre, unidad,
       case cuenta_horas when 1 then 'suma a la deuda' when -1 then 'descuenta' else '—' end as cuenta_de_horas
from public.tipos_novedad
order by orden, nombre;
