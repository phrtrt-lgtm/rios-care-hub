import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Edit, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
  available_variables: any;
}

export default function ConfiguracaoEmail() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({ subject: "", body_html: "" });

  useEffect(() => {
    if (profile?.role !== "admin") {
      navigate("/painel");
      return;
    }
    fetchTemplates();
  }, [profile, navigate]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("name");

      if (error) throw error;
      const processedData = (data || []).map(t => ({
        ...t,
        available_variables: Array.isArray(t.available_variables) 
          ? t.available_variables 
          : JSON.parse(t.available_variables as string)
      }));
      setTemplates(processedData);
    } catch (error) {
      console.error("Erro ao carregar templates:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os templates de email",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      subject: template.subject,
      body_html: template.body_html,
    });
  };

  const handleSave = async () => {
    if (!editingTemplate) return;

    try {
      const { error } = await supabase
        .from("email_templates")
        .update({
          subject: formData.subject,
          body_html: formData.body_html,
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Template atualizado com sucesso",
      });

      setEditingTemplate(null);
      fetchTemplates();
    } catch (error) {
      console.error("Erro ao salvar template:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o template",
        variant: "destructive",
      });
    }
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("body_html") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData.body_html;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + `{{${variable}}}` + after;
      setFormData({ ...formData, body_html: newText });
      
      // Focus back and set cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length + 4, start + variable.length + 4);
      }, 0);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/painel")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Configuração de Templates de Email</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Templates de Email e Notificações</h2>
          <p className="text-muted-foreground">
            Configure os modelos de email enviados automaticamente pelo sistema. Use as variáveis disponíveis para personalizar cada template.
          </p>
        </div>

        <div className="grid gap-4">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle>{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {template.key}
                      </Badge>
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Editar Template: {template.name}</DialogTitle>
                      </DialogHeader>
                      
                      {editingTemplate?.id === template.id && (
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="subject">Assunto do Email</Label>
                            <Input
                              id="subject"
                              value={formData.subject}
                              onChange={(e) =>
                                setFormData({ ...formData, subject: e.target.value })
                              }
                              placeholder="Assunto do email"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="body_html">Corpo do Email (HTML)</Label>
                            <Textarea
                              id="body_html"
                              value={formData.body_html}
                              onChange={(e) =>
                                setFormData({ ...formData, body_html: e.target.value })
                              }
                              placeholder="Corpo do email em HTML"
                              className="min-h-[300px] font-mono text-sm"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Info className="h-4 w-4" />
                              <span>Variáveis Disponíveis</span>
                            </div>
                            <div className="flex flex-wrap gap-2 p-4 bg-muted rounded-lg">
                              {template.available_variables.map((variable) => (
                                <Button
                                  key={variable}
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => insertVariable(variable)}
                                  className="text-xs"
                                >
                                  {`{{${variable}}}`}
                                </Button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Clique em uma variável para inseri-la no cursor. Para blocos condicionais, use: {`{{#if variavel}}...{{/if}}`}
                            </p>
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setEditingTemplate(null)}
                            >
                              Cancelar
                            </Button>
                            <Button onClick={handleSave}>Salvar</Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Assunto: </span>
                    <span className="text-sm text-muted-foreground">{template.subject}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Variáveis: </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {template.available_variables.slice(0, 5).map((variable) => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                      {template.available_variables.length > 5 && (
                        <Badge variant="secondary" className="text-xs">
                          +{template.available_variables.length - 5} mais
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
