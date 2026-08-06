-- =============================================================================
-- PHASE 4 — run in the Supabase SQL Editor.
-- Storage bucket for media, its policies, and block reordering.
-- Safe to re-run.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif','video/mp4'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists media_staff_write on storage.objects;
create policy media_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and app.has_permission('content.manage'));

drop policy if exists media_staff_update on storage.objects;
create policy media_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and app.has_permission('content.manage'));

drop policy if exists media_staff_delete on storage.objects;
create policy media_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and app.has_permission('content.manage'));

create or replace function public.reorder_content_blocks(p_page_id uuid, p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, app
as $$
begin
  if not app.has_permission('content.manage') then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;
  update public.content_blocks b
  set position = idx.ord - 1
  from unnest(p_ids) with ordinality as idx(id, ord)
  where b.id = idx.id and b.page_id = p_page_id;
  insert into public.build_requests (reason, requested_by)
  values ('content blocks reordered', app.current_admin_id());
end;
$$;

revoke all on function public.reorder_content_blocks(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_content_blocks(uuid, uuid[]) to authenticated;

select 'phase 4 ready' as status;
