-- Ajustes: novo tipo "sistema" (erro ou melhoria no próprio portal RIOS),
-- pedido do gestor no mesmo dia da criação da página.
alter table public.ajustes drop constraint if exists ajustes_categoria_check;
alter table public.ajustes add constraint ajustes_categoria_check
  check (categoria in ('anuncio', 'ficha', 'mensagens', 'roupa_de_cama', 'sistema', 'outro'));
