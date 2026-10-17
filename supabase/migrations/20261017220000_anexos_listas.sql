-- Foto e vídeo nas listas da equipe (pedido do gestor, 2026-10-17): compras e
-- tarefas de rua ganham anexos como os ajustes, e os três aceitam vídeo.
--
-- O bucket privado `ajustes` passa a servir às três listas, na mesma pasta
-- <autor>/<id do item>/<n>.<ext> (os ids são UUID, não colidem). As policies
-- de storage dele continuam valendo: equipe vê tudo, o autor vê o que subiu.
-- Limite de 100 MB por arquivo: no navegador o vídeo sobe sem compressão
-- (não há SharedArrayBuffer), o mesmo teto de fileUpload.ts.

update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
         'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska'
       ]
 where id = 'ajustes';

alter table public.compras add column if not exists anexos text[] not null default '{}';
alter table public.compras drop constraint if exists compras_anexos_check;
alter table public.compras add constraint compras_anexos_check check (cardinality(anexos) <= 10);

alter table public.tarefas_rua add column if not exists anexos text[] not null default '{}';
alter table public.tarefas_rua drop constraint if exists tarefas_rua_anexos_check;
alter table public.tarefas_rua add constraint tarefas_rua_anexos_check check (cardinality(anexos) <= 10);

-- ajustes.fotos guarda foto e vídeo; o teto sobe de 6 para 10 como nas outras.
alter table public.ajustes drop constraint if exists ajustes_fotos_check;
alter table public.ajustes add constraint ajustes_fotos_check check (cardinality(fotos) <= 10);
