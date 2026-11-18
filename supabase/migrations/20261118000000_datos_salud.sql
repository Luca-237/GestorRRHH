-- =====================================================================
--  Datos de salud del empleado (pedido de Luca, 18/11/2026), para
--  emergencias y la ART: grupo sanguíneo y alergias / antecedentes /
--  medicación. Los ven los mismos que ven el resto de los datos del
--  empleado (RLS de empleados: admin todos, encargado su sucursal).
--  La carga de los datos NO va en el repo (son datos de salud): se hace
--  con un SQL aparte que se corre una vez.
--  Correrla ANTES de desplegar la página nueva (la página pide estas columnas).
--  Se puede volver a correr.
-- =====================================================================
alter table public.empleados add column if not exists grupo_sanguineo text not null default '';
alter table public.empleados add column if not exists salud text not null default '';

select count(*) filter (where grupo_sanguineo <> '') as con_grupo_sanguineo,
       count(*) filter (where salud <> '') as con_datos_de_salud
from public.empleados;
