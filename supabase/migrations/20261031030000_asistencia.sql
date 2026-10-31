-- =====================================================================
--  Planilla de asistencia: horas de entrada y de salida de cada empleado
--  por día, para calcular llegadas tarde y minutos a favor.
--
--  Horarios (de lo más general a lo más particular):
--     entrada y salida de la SUCURSAL  →  entrada y salida del EMPLEADO (si tiene)
--  Umbrales de minutos a favor (30 antes de la entrada y 10 después de la
--  salida, por defecto):
--     ajustes generales  →  umbral propio del EMPLEADO (si tiene)
--  Los cálculos (tarde, minutos a favor) se hacen en la aplicación con estos datos.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) Ajustes generales (una sola fila)
--    modo_extra: 'todo'      → superado el umbral se cuentan TODOS los minutos
--                'excedente' → solo se cuentan los minutos que pasan del umbral
-- ---------------------------------------------------------------------
create table if not exists public.ajustes_horarios (
  id                smallint primary key default 1 check (id = 1),
  extra_entrada_min int not null default 30 check (extra_entrada_min >= 0),
  extra_salida_min  int not null default 10 check (extra_salida_min >= 0),
  modo_extra        text not null default 'todo' check (modo_extra in ('todo', 'excedente')),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid default auth.uid() references auth.users(id) on delete set null
);
insert into public.ajustes_horarios (id) values (1) on conflict (id) do nothing;

drop trigger if exists ajustes_horarios_actualizacion on public.ajustes_horarios;
create trigger ajustes_horarios_actualizacion
  before update on public.ajustes_horarios
  for each row execute function public.marcar_actualizacion();

-- ---------------------------------------------------------------------
-- 2) Horarios: salida por sucursal; entrada, salida y umbrales propios por empleado
-- ---------------------------------------------------------------------
alter table public.sucursales add column if not exists hora_salida time not null default '18:00';

alter table public.empleados
  add column if not exists hora_salida       time,
  add column if not exists extra_entrada_min int,
  add column if not exists extra_salida_min  int;
alter table public.empleados drop constraint if exists empleados_extra_entrada_min_check;
alter table public.empleados add constraint empleados_extra_entrada_min_check check (extra_entrada_min is null or extra_entrada_min >= 0);
alter table public.empleados drop constraint if exists empleados_extra_salida_min_check;
alter table public.empleados add constraint empleados_extra_salida_min_check check (extra_salida_min is null or extra_salida_min >= 0);

-- ---------------------------------------------------------------------
-- 3) Asistencia: una fila por empleado y día
-- ---------------------------------------------------------------------
create table if not exists public.asistencia (
  id               bigint generated always as identity primary key,
  empleado_id      bigint not null references public.empleados(id) on delete cascade,
  fecha            date not null,
  entrada          time,
  salida           time,
  observacion      text not null default '',
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  unique (empleado_id, fecha),
  check (entrada is not null or salida is not null)
);
create index if not exists asistencia_fecha_idx on public.asistencia (fecha);

drop trigger if exists asistencia_actualizacion on public.asistencia;
create trigger asistencia_actualizacion
  before update on public.asistencia
  for each row execute function public.marcar_actualizacion();

-- ---------------------------------------------------------------------
-- 4) Permisos
-- ---------------------------------------------------------------------
alter table public.ajustes_horarios enable row level security;
alter table public.asistencia enable row level security;
revoke all on public.ajustes_horarios, public.asistencia from anon;
grant select, update on public.ajustes_horarios to authenticated;
grant select, insert, update, delete on public.asistencia to authenticated;
revoke truncate, references, trigger on public.ajustes_horarios, public.asistencia from authenticated;

drop policy if exists ajustes_horarios_select on public.ajustes_horarios;
create policy ajustes_horarios_select on public.ajustes_horarios for select to authenticated using (public.es_usuario_activo());
drop policy if exists ajustes_horarios_update on public.ajustes_horarios;
create policy ajustes_horarios_update on public.ajustes_horarios for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Cada uno carga y corrige la asistencia de los empleados que puede ver (el encargado, los de su sucursal)
drop policy if exists asistencia_select on public.asistencia;
create policy asistencia_select on public.asistencia for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists asistencia_insert on public.asistencia;
create policy asistencia_insert on public.asistencia for insert to authenticated with check (public.puede_ver_empleado(empleado_id));
drop policy if exists asistencia_update on public.asistencia;
create policy asistencia_update on public.asistencia for update to authenticated
  using (public.puede_ver_empleado(empleado_id)) with check (public.puede_ver_empleado(empleado_id));
drop policy if exists asistencia_delete on public.asistencia;
create policy asistencia_delete on public.asistencia for delete to authenticated using (public.puede_ver_empleado(empleado_id));

commit;

-- Control: ajustes y horarios de cada sucursal
select a.extra_entrada_min as minutos_antes_de_la_entrada, a.extra_salida_min as minutos_despues_de_la_salida, a.modo_extra,
       (select string_agg(s.nombre || ' ' || to_char(s.hora_entrada, 'HH24:MI') || '–' || to_char(s.hora_salida, 'HH24:MI'), ', ' order by s.orden) from public.sucursales s) as horarios_por_sucursal
from public.ajustes_horarios a;
