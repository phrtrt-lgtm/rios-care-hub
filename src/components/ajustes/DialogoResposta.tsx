import { DialogoObservacao } from "@/components/listas/DialogoObservacao";
import type { Ajuste } from "@/hooks/useAjustes";

interface Props {
  ajuste: Ajuste | null;
  status: "feito" | "descartado";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salvando: boolean;
  onConfirmar: (resposta: string) => void;
}

/** Concluir (ou dizer que não precisa) com uma observação que quem avisou vai ler. */
export function DialogoResposta({ ajuste, status, open, onOpenChange, salvando, onConfirmar }: Props) {
  const feito = status === "feito";
  const jaResolvido = ajuste?.status === status;

  return (
    <DialogoObservacao
      open={open}
      onOpenChange={onOpenChange}
      salvando={salvando}
      titulo={jaResolvido ? "Observação" : feito ? "Marcar como feito" : "Não precisa mudar"}
      descricao={`${feito ? "Conte o que foi feito." : "Explique por quê."} Quem avisou vê esta observação.`}
      trecho={ajuste?.descricao}
      valorInicial={ajuste?.resposta}
      placeholder={feito ? "Ex.: corrigido no Airbnb e na Hostex." : "Ex.: já estava certo; a senha continua a mesma."}
      textoConfirmar={jaResolvido ? "Salvar" : feito ? "Marcar como feito" : "Confirmar"}
      variante={feito ? "success" : "default"}
      onConfirmar={onConfirmar}
    />
  );
}
