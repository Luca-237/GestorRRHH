-- =====================================================================
--  Gestor de RRHH — modelo v2, adaptado a la planilla de Antonella
--  ("RRHH - Novedades Laborales v2", Apps Script).
--   · Empleados: legajo automático, sector, datos personales y de emergencia,
--     motivo de baja y hora de entrada.
--   · Novedades: montos en pesos (adelantos, viáticos), registros sin cantidad
--     (alta, baja, cambio de obra social), hora (llegada / inicio de horas extra),
--     liquidado (horas extra y goces de vacaciones) y origen (importación).
--   · Liquidaciones de vacaciones (la nota y el pago, aparte de los días gozados).
--   · Feriados.
--   · Automático: alta/baja como novedad y una falta cada 3 llegadas tarde acumuladas.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) Empleados: datos nuevos
-- ---------------------------------------------------------------------
alter table public.empleados
  add column if not exists legajo                     text,
  add column if not exists sector                     text not null default '',
  add column if not exists fecha_nacimiento           date,
  add column if not exists email                      text not null default '',
  add column if not exists direccion                  text not null default '',
  add column if not exists obra_social                text not null default '',
  add column if not exists banco                      text not null default '',
  add column if not exists contacto_emergencia_nombre text not null default '',
  add column if not exists contacto_emergencia_tel    text not null default '',
  add column if not exists motivo_baja                text not null default '',
  add column if not exists hora_entrada               time;   -- para calcular minutos de llegada tarde (si no hay, 09:00)

create unique index if not exists empleados_legajo_uq on public.empleados (legajo) where coalesce(legajo, '') <> '';

-- Legajo como en la planilla: últimos 3 dígitos del DNI + inicial del nombre + inicial del apellido.
-- Si ya existe, se le agrega -2, -3…
create or replace function public.completar_empleado()
returns trigger
language plpgsql
as $$
declare
  base text; candidato text; n int := 1;
begin
  if coalesce(trim(new.legajo), '') = '' then
    base := upper(
      coalesce(nullif(right(regexp_replace(coalesce(new.dni, ''), '\D', '', 'g'), 3), ''), '000') ||
      coalesce(nullif(left(trim(coalesce(new.nombre, '')), 1), ''), 'X') ||
      coalesce(nullif(left(trim(coalesce(new.apellido, '')), 1), ''), 'X'));
    candidato := base;
    while exists (select 1 from public.empleados e where e.legajo = candidato and e.id is distinct from new.id) loop
      n := n + 1; candidato := base || '-' || n;
    end loop;
    new.legajo := candidato;
  else
    new.legajo := upper(trim(new.legajo));
  end if;
  if new.activo then new.motivo_baja := ''; end if;
  return new;
end;
$$;

drop trigger if exists empleados_completar on public.empleados;
create trigger empleados_completar
  before insert or update on public.empleados
  for each row execute function public.completar_empleado();

-- Legajo para los que ya estaban cargados
update public.empleados set legajo = null where coalesce(legajo, '') = '';

-- ---------------------------------------------------------------------
-- 2) Tipos de novedad: montos en pesos y registros sin cantidad
-- ---------------------------------------------------------------------
alter table public.tipos_novedad drop constraint if exists tipos_novedad_unidad_check;
alter table public.tipos_novedad add constraint tipos_novedad_unidad_check
  check (unidad in ('dias', 'minutos', 'horas', 'pesos', 'registro'));

insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas) values
  ('licencia_accidente', 'Licencia por accidente', 'dias',     false, true,  '#6b4a8a', 6,  true, 0),
  ('adelanto',           'Adelanto de sueldo',     'pesos',    false, false, '#1f5f8b', 11, true, 0),
  ('viatico',            'Viático',                'pesos',    false, false, '#3c7a89', 12, true, 0),
  ('alta',               'Alta laboral',           'registro', false, false, '#2f6b3a', 13, true, 0),
  ('baja',               'Baja laboral',           'registro', false, false, '#7a1f1f', 14, true, 0),
  ('cambio_obra_social', 'Cambio de obra social',  'registro', false, false, '#8a8a8a', 15, true, 0)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3) Novedades: columnas nuevas
-- ---------------------------------------------------------------------
alter table public.novedades alter column cantidad type numeric(12,2);   -- los pesos necesitan más dígitos
alter table public.novedades
  add column if not exists hora          time,     -- hora de llegada (tarde) o de inicio (horas extra)
  add column if not exists liquidado_en  date,     -- horas extra: mes en que se pagaron · vacaciones: fecha de liquidación
  add column if not exists origen        text,     -- de dónde vino (ej. "planilla:Novedades:123") para no importar dos veces
  add column if not exists generada_por  bigint references public.novedades(id) on delete cascade;  -- falta automática → su llegada tarde
create unique index if not exists novedades_origen_uq on public.novedades (origen) where origen is not null;
create index if not exists novedades_generada_idx on public.novedades (generada_por);

create or replace function public.completar_novedad()
returns trigger
language plpgsql
as $$
declare
  t public.tipos_novedad;
begin
  select * into t from public.tipos_novedad where clave = new.tipo;
  if new.fecha_hasta is null then new.fecha_hasta := new.fecha_desde; end if;
  if t.unidad = 'dias' then
    new.cantidad := (new.fecha_hasta - new.fecha_desde) + 1;
  else
    -- Minutos, horas, pesos o registro: es un solo día
    new.fecha_hasta := new.fecha_desde;
    if t.unidad = 'registro' then new.cantidad := 0; end if;
  end if;
  if t.descuenta_vacaciones then
    -- Período vacacional (LCT): del 1/10 al 30/4. Lo tomado de enero a abril
    -- corresponde por defecto al año anterior. Se puede indicar a mano.
    if new.anio_vacaciones is null then
      new.anio_vacaciones := extract(year from new.fecha_desde)::int
                             - case when extract(month from new.fecha_desde) <= 4 then 1 else 0 end;
    end if;
  else
    new.anio_vacaciones := null;
  end if;
  if new.tipo <> 'horas_extra' then new.recargo := null; end if;
  if new.tipo not in ('horas_extra', 'llegada_tarde') then new.hora := null; end if;
  if new.tipo <> 'horas_extra' and not coalesce(t.descuenta_vacaciones, false) then new.liquidado_en := null; end if;
  return new;
end;
$$;

-- Cada 3 llegadas tarde acumuladas (3.ª, 6.ª, 9.ª…) se genera una falta injustificada.
-- Si se borra esa llegada tarde, se borra su falta.
create or replace function public.falta_por_llegadas_tarde()
returns trigger
language plpgsql
as $$
declare
  total int;
begin
  select count(*) into total from public.novedades
  where empleado_id = new.empleado_id and tipo = 'llegada_tarde';
  if total > 0 and total % 3 = 0 then
    insert into public.novedades (empleado_id, tipo, fecha_desde, fecha_hasta, observacion, generada_por)
    values (new.empleado_id, 'falta', new.fecha_desde, new.fecha_desde,
            'Falta injustificada automática — ' || total || ' llegadas tarde acumuladas', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists novedades_falta_tardanzas on public.novedades;
create trigger novedades_falta_tardanzas
  after insert on public.novedades
  for each row when (new.tipo = 'llegada_tarde')
  execute function public.falta_por_llegadas_tarde();

-- ---------------------------------------------------------------------
-- 4) Alta y baja quedan como novedad, solas
-- ---------------------------------------------------------------------
create or replace function public.novedad_alta_baja()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.fecha_ingreso is not null then
    insert into public.novedades (empleado_id, tipo, fecha_desde, observacion)
    values (new.id, 'alta', new.fecha_ingreso,
            trim(both ' /' from coalesce(new.puesto, '') || ' / ' || coalesce(new.sector, '')));
  end if;
  if (tg_op = 'INSERT' and not new.activo) or (tg_op = 'UPDATE' and old.activo and not new.activo) then
    insert into public.novedades (empleado_id, tipo, fecha_desde, observacion)
    values (new.id, 'baja', coalesce(new.fecha_egreso, current_date),
            case when new.motivo_baja <> '' then 'Motivo: ' || new.motivo_baja else '' end);
  end if;
  return null;
end;
$$;

drop trigger if exists empleados_alta_baja on public.empleados;
create trigger empleados_alta_baja
  after insert or update of activo on public.empleados
  for each row execute function public.novedad_alta_baja();

-- Altas y bajas de los que ya estaban cargados
insert into public.novedades (empleado_id, tipo, fecha_desde, observacion)
select e.id, 'alta', e.fecha_ingreso, trim(both ' /' from coalesce(e.puesto, '') || ' / ' || e.sector)
from public.empleados e
where e.fecha_ingreso is not null
  and not exists (select 1 from public.novedades n where n.empleado_id = e.id and n.tipo = 'alta');
insert into public.novedades (empleado_id, tipo, fecha_desde, observacion)
select e.id, 'baja', coalesce(e.fecha_egreso, current_date), case when e.motivo_baja <> '' then 'Motivo: ' || e.motivo_baja else '' end
from public.empleados e
where not e.activo
  and not exists (select 1 from public.novedades n where n.empleado_id = e.id and n.tipo = 'baja');

-- ---------------------------------------------------------------------
-- 5) Liquidaciones de vacaciones (nota de vacaciones / pago en el recibo)
--    Al cargar una, los goces de ese empleado y período quedan liquidados.
-- ---------------------------------------------------------------------
create table if not exists public.vacaciones_liquidaciones (
  id                 bigint generated always as identity primary key,
  empleado_id        bigint not null references public.empleados(id) on delete cascade,
  anio               int not null check (anio between 2000 and 2100),
  dias               numeric(5,1) not null check (dias > 0),
  fecha_liquidacion  date not null,
  descripcion        text not null default '',
  origen             text,
  creado_en          timestamptz not null default now(),
  creado_por         uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists vac_liq_empleado_idx on public.vacaciones_liquidaciones (empleado_id, anio);
create unique index if not exists vac_liq_origen_uq on public.vacaciones_liquidaciones (origen) where origen is not null;

create or replace function public.marcar_goces_liquidados()
returns trigger
language plpgsql
as $$
begin
  update public.novedades n set liquidado_en = new.fecha_liquidacion
  from public.tipos_novedad t
  where t.clave = n.tipo and t.descuenta_vacaciones
    and n.empleado_id = new.empleado_id and n.anio_vacaciones = new.anio and n.liquidado_en is null;
  return null;
end;
$$;

drop trigger if exists vac_liq_marcar on public.vacaciones_liquidaciones;
create trigger vac_liq_marcar
  after insert on public.vacaciones_liquidaciones
  for each row execute function public.marcar_goces_liquidados();

-- ---------------------------------------------------------------------
-- 6) Feriados
-- ---------------------------------------------------------------------
create table if not exists public.feriados (
  fecha        date primary key,
  descripcion  text not null default ''
);

-- ---------------------------------------------------------------------
-- 7) Permisos
-- ---------------------------------------------------------------------
alter table public.vacaciones_liquidaciones enable row level security;
alter table public.feriados enable row level security;
revoke all on public.vacaciones_liquidaciones, public.feriados from anon;
grant select, insert, update, delete on public.vacaciones_liquidaciones, public.feriados to authenticated;
revoke truncate, references, trigger on public.vacaciones_liquidaciones, public.feriados from authenticated;

drop policy if exists vac_liq_select on public.vacaciones_liquidaciones;
create policy vac_liq_select on public.vacaciones_liquidaciones for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists vac_liq_insert on public.vacaciones_liquidaciones;
create policy vac_liq_insert on public.vacaciones_liquidaciones for insert to authenticated with check (public.es_admin());
drop policy if exists vac_liq_update on public.vacaciones_liquidaciones;
create policy vac_liq_update on public.vacaciones_liquidaciones for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists vac_liq_delete on public.vacaciones_liquidaciones;
create policy vac_liq_delete on public.vacaciones_liquidaciones for delete to authenticated using (public.es_admin());

drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select to authenticated using (public.es_usuario_activo());
drop policy if exists feriados_insert on public.feriados;
create policy feriados_insert on public.feriados for insert to authenticated with check (public.es_admin());
drop policy if exists feriados_update on public.feriados;
create policy feriados_update on public.feriados for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists feriados_delete on public.feriados;
create policy feriados_delete on public.feriados for delete to authenticated using (public.es_admin());

commit;

-- Control
select (select count(*) from public.empleados where coalesce(legajo, '') <> '') as empleados_con_legajo,
       (select count(*) from public.novedades where tipo = 'alta') as altas,
       (select count(*) from public.novedades where tipo = 'baja') as bajas,
       (select count(*) from public.tipos_novedad) as tipos_de_novedad;
