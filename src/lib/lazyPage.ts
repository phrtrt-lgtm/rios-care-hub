import { lazy, type ComponentType } from "react";

const CHAVE_RECARGA = "chunk-reload-em-andamento";

const jaTentouRecarregar = () => {
  try {
    return sessionStorage.getItem(CHAVE_RECARGA) === "1";
  } catch {
    // Modo privado ou storage bloqueado: sem memória, não insiste.
    return true;
  }
};

const marcarRecarga = () => {
  try {
    sessionStorage.setItem(CHAVE_RECARGA, "1");
  } catch {
    /* segue sem marcar */
  }
};

const limparMarca = () => {
  try {
    sessionStorage.removeItem(CHAVE_RECARGA);
  } catch {
    /* noop */
  }
};

/**
 * `lazy()` com recuperação para chunk obsoleto.
 *
 * Com code-splitting, o index.html novo referencia chunks com hash novo. Uma
 * aba aberta desde antes do deploy tenta buscar o hash antigo, que não existe
 * mais, e o import dinâmico falha — resultado: tela branca.
 *
 * Aqui, a primeira falha recarrega a página uma vez, o que traz o index.html
 * atual e os hashes certos.
 *
 * A marca é limpa **quando um chunk carrega com sucesso**, nunca na montagem do
 * App: o App monta antes de a rota resolver, então limpar ali reabriria a
 * permissão de recarga a cada tentativa e faria laço infinito.
 */
export const lazyPage = <T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>,
) =>
  lazy(() =>
    importar()
      .then((modulo) => {
        limparMarca();
        return modulo;
      })
      .catch((erro) => {
        if (!jaTentouRecarregar()) {
          console.warn("[lazyPage] chunk não encontrado, recarregando uma vez", erro);
          marcarRecarga();
          window.location.reload();
          // Promise pendente de propósito: a página está recarregando.
          return new Promise<{ default: T }>(() => {});
        }
        throw erro;
      }),
  );
