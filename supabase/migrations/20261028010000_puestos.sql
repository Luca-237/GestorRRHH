-- =====================================================================
--  Puestos como lista administrable (como las sucursales).
--  empleados.puesto pasa a apuntar a puestos.nombre: si un admin renombra
--  un puesto, se actualiza solo en todos los empleados (on update cascade).
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

create table if not exists public.puestos (
  id         bigint generated always as identity primary key,
  nombre     text not null unique check (length(trim(nombre)) > 0),
  orden      int not null default 100,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

insert into public.puestos (nombre, orden) values
  ('Vendedor B', 1), ('Auxiliar B', 2), ('Administrativo B', 3), ('Encargado', 4), ('Marketing', 5)
on conflict (nombre) do nothing;

-- Los puestos que ya tengan los empleados cargados
insert into public.puestos (nombre)
select distinct trim(puesto) from public.empleados
where coalesce(trim(puesto), '') <> ''
on conflict (nombre) do nothing;

-- "Sin puesto" = null (antes era texto vacío)
alter table public.empleados alter column puesto drop not null;
alter table public.empleados alter column puesto drop default;
update public.empleados set puesto = null where coalesce(trim(puesto), '') = '';
update public.empleados set puesto = trim(puesto) where puesto <> trim(puesto);

alter table public.empleados drop constraint if exists empleados_puesto_fkey;
alter table public.empleados
  add constraint empleados_puesto_fkey foreign key (puesto)
  references public.puestos(nombre) on update cascade on delete restrict;
create index if not exists empleados_puesto_idx on public.empleados (puesto);

-- Permisos: leen todos los usuarios activos; agrega, renombra o desactiva el admin
alter table public.puestos enable row level security;
revoke all on public.puestos from anon;
grant select, insert, update on public.puestos to authenticated;
revoke delete, truncate, references, trigger on public.puestos from authenticated;

drop policy if exists puestos_select on public.puestos;
create policy puestos_select on public.puestos for select to authenticated using (public.es_usuario_activo());
drop policy if exists puestos_insert on public.puestos;
create policy puestos_insert on public.puestos for insert to authenticated with check (public.es_admin());
drop policy if exists puestos_update on public.puestos;
create policy puestos_update on public.puestos for update to authenticated using (public.es_admin()) with check (public.es_admin());

commit;

-- Control: puestos y cuántos empleados activos tiene cada uno
select p.nombre as puesto, p.activo, count(e.id) filter (where e.activo) as empleados_activos
from public.puestos p
left join public.empleados e on e.puesto = p.nombre
group by p.nombre, p.activo, p.orden
order by p.orden, p.nombre;
