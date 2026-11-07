-- =====================================================================
--  Banco de horas: las horas extra se pueden guardar como horas a favor en
--  vez de liquidarlas en el momento. El empleado decide después para qué
--  usarlas (tiempo libre, cubrir horas que debe, o cobrarlas).
--
--  · Un depósito es una novedad de horas extra con banco = true. Conserva su
--    fecha y su recargo (50 o 100): el banco lleva dos columnas, una por tipo.
--  · banco_usado: cuántas horas de ese depósito ya se usaron. Lo que queda es
--    cantidad - banco_usado.
--  · Un depósito no se liquida: no figura en "Pendientes de liquidar" hasta que
--    se pasa a pago.
--  · Tipo nuevo "Uso de horas del banco": deja registrado cada uso.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.novedades add column if not exists banco boolean not null default false;
alter table public.novedades add column if not exists banco_usado numeric(8,2) not null default 0;
alter table public.novedades drop constraint if exists novedades_banco_usado_check;
alter table public.novedades add constraint novedades_banco_usado_check check (banco_usado >= 0);

-- Reglas del banco (en un trigger aparte, para no tocar completar_novedad)
create or replace function public.controlar_banco()
returns trigger
language plpgsql
as $$
begin
  -- Solo las horas extra pueden ir al banco
  if new.tipo <> 'horas_extra' then
    new.banco := false;
  end if;
  if not new.banco then
    new.banco_usado := 0;
  else
    new.liquidado_en := null;           -- lo que está en el banco no está liquidado
    if new.banco_usado > new.cantidad then new.banco_usado := new.cantidad; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists novedades_banco on public.novedades;
create trigger novedades_banco
  before insert or update on public.novedades
  for each row execute function public.controlar_banco();

-- Cada uso de horas del banco queda registrado como una novedad
insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('banco_uso', 'Uso de horas del banco', 'horas', false, false, '#2f6b3a', 14, true, 0, false)
on conflict (clave) do nothing;

commit;

-- Control
select count(*) filter (where banco) as depositos_en_el_banco,
       coalesce(sum(cantidad - banco_usado) filter (where banco), 0) as horas_en_el_banco,
       (select count(*) from public.tipos_novedad where clave = 'banco_uso') as tipo_banco_uso
from public.novedades;
