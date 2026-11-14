drop policy if exists "auth read hostex_sync_log" on public.hostex_sync_log;
create policy "Team reads hostex_sync_log" on public.hostex_sync_log for select to authenticated using (public.is_team_member(auth.uid()));

drop policy if exists "Authenticated users can view charge attachments" on storage.objects;
create policy "Authenticated users can view charge attachments" on storage.objects for select to authenticated
using (
  bucket_id = 'charge-attachments' and (
    public.is_team_member(auth.uid())
    or exists (
      select 1 from public.charges c
      where c.id::text = (storage.foldername(name))[1]
        and (c.owner_id = auth.uid() or public.has_property_access(auth.uid(), c.property_id))
    )
  )
);