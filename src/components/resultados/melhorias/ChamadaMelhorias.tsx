import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Chamada para o plano de melhorias, na visão geral. É só imagem e texto: a maquete de verdade (e a
 * consulta dela) só carrega quando a pessoa abre a aba.
 */
export function ChamadaMelhorias({ equipe, onAbrir }: { equipe: boolean; onAbrir: () => void }) {
  return (
    <section aria-labelledby="titulo-chamada-melhorias" className="relative isolate overflow-hidden rounded-2xl bg-secondary text-secondary-foreground shadow-sm">
      {/* no celular a pintura vai em cima do texto; em tela larga, à direita, se desfazendo no azul */}
      <img
        src="/melhorias/completa-960.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="h-40 w-full object-cover object-[55%_42%] [mask-image:linear-gradient(to_bottom,black_72%,transparent)] sm:hidden"
      />
      <img
        src="/melhorias/completa-960.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-y-0 right-0 -z-10 hidden h-full w-[64%] object-cover [mask-image:linear-gradient(to_right,transparent,black_34%)] sm:block"
      />
      <div className="max-w-md px-5 pb-5 pt-1 sm:pt-5 md:p-6">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          Novo · Plano de melhorias
        </p>
        <h3 id="titulo-chamada-melhorias" className="mt-2 text-lg font-semibold leading-snug tracking-tight md:text-xl">
          O que faria {equipe ? "este imóvel" : "o seu imóvel"} render mais?
        </h3>
        <p className="mt-1.5 text-sm opacity-90">Veja cada melhoria entrar na maquete, com a conta do investimento e do retorno feita com os dados da RIOS.</p>
        <Button onClick={onAbrir} className="mt-4">
          Abrir o plano
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
