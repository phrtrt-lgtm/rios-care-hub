import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MigrarAnexos() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const migrateAttachments = async () => {
    try {
      setLoading(true);
      setResult(null);

      toast({
        title: "Iniciando migração...",
        description: "Isso pode levar alguns minutos dependendo da quantidade de anexos",
      });

      const { data, error } = await supabase.functions.invoke("migrate-attachments", {
        body: {},
      });

      if (error) throw error;

      setResult(data);
      
      toast({
        title: "Migração concluída!",
        description: `${data.migrated} anexos migrados com sucesso`,
      });
    } catch (error: any) {
      console.error("Erro na migração:", error);
      toast({
        title: "Erro na migração",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-8">
      <div className="container mx-auto max-w-2xl">
        <Button 
          variant="ghost" 
          onClick={() => goBack(navigate, "/painel")}
          className="mb-6"
        >
          ← Voltar ao Painel
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Migrar Anexos Antigos</CardTitle>
            <CardDescription>
              Esta ferramenta migra anexos de cobranças antigas do Monday.com para o armazenamento local.
              Execute esta migração apenas uma vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">O que esta migração faz:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Identifica anexos com referências antigas do Monday.com</li>
                <li>Baixa os arquivos do Monday.com</li>
                <li>Faz upload para o armazenamento da plataforma</li>
                <li>Atualiza as referências dos anexos</li>
              </ul>
            </div>

            <Button 
              onClick={migrateAttachments}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Migrando anexos...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Iniciar Migração
                </>
              )}
            </Button>

            {result && (
              <Card className="bg-muted/30">
                <CardHeader>
                  <CardTitle className="text-lg">Resultado da Migração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-background rounded-lg">
                      <div className="text-3xl font-bold text-primary">{result.total}</div>
                      <div className="text-sm text-muted-foreground">Total</div>
                    </div>
                    <div className="p-4 bg-background rounded-lg">
                      <div className="text-3xl font-bold text-success">{result.migrated}</div>
                      <div className="text-sm text-muted-foreground">Migrados</div>
                    </div>
                  </div>
                  
                  {result.failed > 0 && (
                    <div className="p-4 bg-destructive/10 rounded-lg">
                      <div className="font-medium text-destructive">
                        {result.failed} anexos com erro
                      </div>
                      {result.errors?.length > 0 && (
                        <ul className="mt-2 text-sm space-y-1 text-muted-foreground">
                          {result.errors.slice(0, 5).map((error: string, i: number) => (
                            <li key={i}>• {error}</li>
                          ))}
                          {result.errors.length > 5 && (
                            <li>• ... e mais {result.errors.length - 5} erros</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
