import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSignature, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function OwnerContractInviteCard() {
  const { user } = useAuth();
  const [contract, setContract] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("contracts")
        .select("id, status, property_id, properties:property_id(name)")
        .eq("owner_id", user.id)
        .in("status", ["awaiting_owner", "owner_filling", "correction_requested"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setContract(data);
    })();
  }, [user]);

  if (!contract) return null;

  const isCorrection = contract.status === "correction_requested";

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="rounded-full bg-primary/15 p-3">
          <FileSignature className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">
            {isCorrection ? "Correção solicitada no contrato" : "Preencha seus dados para emissão do contrato"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {isCorrection
              ? "A RIOS pediu ajustes nos dados que você informou. Revise e reenvie."
              : `A RIOS criou o pré-contrato${contract.properties?.name ? ` do imóvel ${contract.properties.name}` : ""}. Complete seus dados para gerarmos a versão final.`}
          </p>
          <Button className="mt-3" size="sm" onClick={() => navigate(`/contrato/${contract.id}`)}>
            {isCorrection ? "Revisar dados" : "Preencher agora"} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
