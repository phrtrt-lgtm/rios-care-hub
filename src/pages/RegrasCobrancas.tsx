import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface BillingRulesContent {
  title: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
}

export default function RegrasCobrancas() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<BillingRulesContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "billing_rules")
        .single();

      if (error) throw error;

      if (data?.value && typeof data.value === 'object' && 'content' in data.value) {
        setRules(data.value.content as unknown as BillingRulesContent);
      }
    } catch (error) {
      console.error("Erro ao carregar regras:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => goBack(navigate)}
          className="mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{rules?.title || "Regras de Cobrança"}</CardTitle>
            <CardDescription>
              Entenda como funcionam as cobranças e seus prazos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {rules?.sections.map((section, index) => (
              <div key={index} className="space-y-2">
                <h3 className="text-xl font-semibold text-primary">
                  {section.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Importante:</strong> Toda tratativa deve ocorrer dentro do portal, 
                para registro e transparência. Em caso de dúvidas, entre em contato 
                através do portal ou responda aos e-mails de notificação.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}