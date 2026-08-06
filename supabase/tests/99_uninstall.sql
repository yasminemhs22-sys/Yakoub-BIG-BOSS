-- =============================================================================
-- 99_uninstall.sql
-- Removes the test harness. Run when verification is finished.
-- Test DATA is already gone: files 01-04 roll back.
-- =============================================================================

drop schema if exists test cascade;

-- Safety net: remove any fixture left behind by an interrupted run.
delete from public.orders          where phone_e164 like '+21356%' and first_name in ('Amine','Bot','X','Sans','Bad','Sur','Annul','Faux','Karim','Conc');
delete from public.phone_blocklist where phone_e164 in ('+213567777777');
delete from public.products        where slug like 'zztest%' or slug like 'zzconc%';
delete from public.categories      where slug like 'zztest%';
delete from public.colors          where name_fr like 'ZZTEST%' or name_fr like 'ZZCONC%';
delete from public.sizes           where label_fr like 'ZZTEST%';
delete from public.media           where storage_path like 'zztest%' or storage_path like 'zzconc%';
delete from public.communes        where name_fr like 'ZZTEST%' or name_fr like 'ZZCONC%';
delete from public.wilayas         where name_fr like 'ZZTEST%' or name_fr like 'ZZCONC%';

select 'Harness removed. Residual fixtures cleared.' as status,
       (select count(*) from public.wilayas where name_fr like 'ZZ%')  as leftover_wilayas,
       (select count(*) from public.products where slug like 'zz%')    as leftover_products;
