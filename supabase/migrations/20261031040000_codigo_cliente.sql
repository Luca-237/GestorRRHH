-- =====================================================================
--  Número de cliente de cada empleado en el sistema de gestión (el de la
--  planilla de saldos de cuenta corriente). Se guarda la primera vez que
--  se importa la planilla; después se empareja solo por este número.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.empleados add column if not exists codigo_cliente text;
alter table public.empleados drop constraint if exists empleados_codigo_cliente_check;
alter table public.empleados add constraint empleados_codigo_cliente_check check (codigo_cliente is null or codigo_cliente ~ '^[0-9]+$');
create unique index if not exists empleados_codigo_cliente_uq on public.empleados (codigo_cliente) where codigo_cliente is not null;

commit;

-- Control: cuántos empleados ya tienen número de cliente
select count(*) filter (where codigo_cliente is not null) as con_numero_de_cliente, count(*) as empleados from public.empleados;
