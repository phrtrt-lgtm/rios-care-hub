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
import { ArrowLeft, Edit, Info, Eye } from "lucide-react";
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
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
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

  // Render template with example data
  const renderTemplate = (template: string, variables: Record<string, any>): string => {
    let result = template;

    // Process conditional blocks {{#if variable}}...{{/if}}
    const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(ifRegex, (match, varName, content) => {
      const value = variables[varName];
      return value ? content : '';
    });

    // Replace simple variables {{variable}}
    const varRegex = /\{\{(\w+)\}\}/g;
    result = result.replace(varRegex, (match, varName) => {
      const value = variables[varName];
      return value !== undefined && value !== null ? String(value) : '';
    });

    return result;
  };

  const getExampleData = (templateKey: string): Record<string, any> => {
    const baseUrl = window.location.origin;
    
    const examples: Record<string, Record<string, any>> = {
      inspection_created: {
        property_name: "Apto 301 - Edifício Vista Mar",
        cleaner_name: "Maria Silva",
        cleaner_phone: "(48) 99999-8888",
        inspection_date: new Date().toLocaleString("pt-BR"),
        inspection_notes: "Vistoria realizada com sucesso. Apartamento em excelente estado de conservação. Todos os itens checados e aprovados. Limpeza completa realizada incluindo banheiros, cozinha e área de serviço.",
        has_audio: true,
        portal_url: `${baseUrl}/vistorias`,
        monday_item_id: "12345678",
      },
      charge_created: {
        charge_title: "Reposição de toalha danificada",
        charge_description: "Substituição de toalha de banho danificada durante a estadia. Valor referente ao custo de reposição do item.",
        total_amount: "R$ 129,90",
        management_contribution: "R$ 40,00",
        due_amount: "R$ 89,90",
        charge_amount: "R$ 89,90",
        maintenance_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        property_name: "Apto 301 - Edifício Vista Mar",
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_reminder_24h: {
        charge_title: "Reposição de toalha danificada",
        charge_amount: "R$ 89,90",
        due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_reminder_48h: {
        charge_title: "Reposição de toalha danificada",
        charge_amount: "R$ 89,90",
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_reminder_day: {
        charge_title: "Reposição de toalha danificada",
        charge_amount: "R$ 89,90",
        due_date: new Date().toLocaleDateString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_reminder: {
        charge_title: "Reposição de toalha danificada",
        total_amount: "R$ 129,90",
        management_contribution: "R$ 40,00",
        due_amount: "R$ 89,90",
        charge_amount: "R$ 89,90",
        maintenance_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_overdue: {
        charge_title: "Reposição de toalha danificada",
        total_amount: "R$ 129,90",
        management_contribution: "R$ 40,00",
        due_amount: "R$ 89,90",
        charge_amount: "R$ 89,90",
        maintenance_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      alert_created: {
        alert_title: "Manutenção programada no sistema",
        alert_message: "Informamos que haverá manutenção programada no portal no dia 15/12 das 02h às 04h. Durante este período o sistema poderá ficar instável. Pedimos desculpas pelo inconveniente.",
        alert_type: "warning",
        alert_type_label: "Atenção",
        alert_type_emoji: "⚠️",
        alert_color: "#f59e0b",
        alert_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleString("pt-BR"),
        created_date: new Date().toLocaleString("pt-BR"),
      },
      charge_debit_notice: {
        owner_name: "João Silva",
        owner_email: "joao@email.com",
        charge_id: "123e4567-e89b-12d3-a456-426614174000",
        charge_title: "Reposição de toalha danificada",
        charge_amount: "R$ 89,90",
        charge_description: "Substituição de toalha de banho danificada durante a estadia.",
        debit_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        property_name: "Apto 301 - Edifício Vista Mar",
      },
      approval_approved: {
        user_name: "Maria Santos",
        user_email: "maria.santos@email.com",
        user_type: "Proprietário",
        approval_date: new Date().toLocaleString("pt-BR"),
        portal_url: baseUrl,
      },
      approval_request: {
        user_name: "Maria Santos",
        user_email: "maria.santos@email.com",
        user_type: "Proprietário",
        request_date: new Date().toLocaleString("pt-BR"),
        approval_url: `${baseUrl}/aprovacoes`,
      },
      ticket_created_team: {
        owner_name: "João Silva",
        ticket_subject: "Dúvida sobre bloqueio de datas",
        ticket_description: "Gostaria de bloquear meu apartamento de 15/12 a 20/12 para uma reforma. Como faço isso?",
        ticket_type: "Dúvida",
        ticket_priority: "Normal",
        created_date: new Date().toLocaleString("pt-BR"),
        ticket_url: `${baseUrl}/todos-tickets`,
      },
      ticket_created_owner: {
        ticket_subject: "Dúvida sobre bloqueio de datas",
        ticket_description: "Gostaria de bloquear meu apartamento de 15/12 a 20/12 para uma reforma. Como faço isso?",
        ticket_type: "Dúvida",
        created_date: new Date().toLocaleString("pt-BR"),
        ticket_url: `${baseUrl}/`,
      },
      ticket_created_by_admin_owner: {
        ticket_subject: "Manutenção preventiva no ar-condicionado",
        ticket_description: "Identificamos a necessidade de realizar manutenção preventiva no ar-condicionado do seu apartamento. A visita está agendada para a próxima semana.",
        ticket_type: "Manutenção",
        created_by_name: "Equipe RIOS",
        created_date: new Date().toLocaleString("pt-BR"),
        ticket_url: `${baseUrl}/`,
      },
      ticket_message_owner: {
        ticket_subject: "Dúvida sobre bloqueio de datas",
        author_name: "Equipe RIOS",
        message_body: "Olá! Recebi sua solicitação de bloqueio das datas de 15/12 a 20/12. Já realizei o bloqueio no sistema. As datas não estarão mais disponíveis para reserva. Se precisar de mais alguma coisa, é só avisar!",
        message_date: new Date().toLocaleString("pt-BR"),
        ticket_url: `${baseUrl}/`,
      },
      ticket_message_team: {
        ticket_subject: "Dúvida sobre bloqueio de datas",
        owner_name: "João Silva",
        message_body: "Gostaria de bloquear meu apartamento de 15/12 a 20/12 para uma reforma. Como faço isso?",
        message_date: new Date().toLocaleString("pt-BR"),
        ticket_url: `${baseUrl}/todos-tickets`,
      },
      charge_message_owner: {
        charge_title: "Reposição de toalha danificada",
        author_name: "Equipe RIOS",
        message_body: "Olá! Verifiquei sua contestação sobre a cobrança. A faxineira confirmou que a toalha estava danificada com um rasgo grande. Enviei fotos para você verificar. Ficamos à disposição para esclarecer.",
        message_date: new Date().toLocaleString("pt-BR"),
        charge_url: `${baseUrl}/minhas-cobrancas`,
      },
      charge_message_team: {
        charge_title: "Reposição de toalha danificada",
        owner_name: "João Silva",
        message_body: "Não concordo com essa cobrança. A toalha já estava velha e precisava ser trocada mesmo. Por favor, verifiquem.",
        message_date: new Date().toLocaleString("pt-BR"),
      charge_url: `${baseUrl}/gerenciar-cobrancas`,
      },
      booking_commission_created: {
        owner_name: "João Silva",
        property_name: "Apto 301 - Edifício Vista Mar",
        guest_name: "Carlos Mendes",
        check_in: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        check_out: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        commission_percent: 22,
        commission_amount: "R$ 330,00",
        cleaning_fee: "R$ 150,00",
        total_due: "R$ 480,00",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
        commission_url: `${baseUrl}/minha-comissao-booking/exemplo`,
      },
    };

    return examples[templateKey] || {};
  };

  const handlePreview = (template: EmailTemplate) => {
    setPreviewTemplate(template);
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
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Preview: {template.name}</DialogTitle>
                        </DialogHeader>
                        
                        {previewTemplate?.id === template.id && (
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Assunto:</Label>
                              <div className="p-3 bg-muted rounded-lg text-sm">
                                {renderTemplate(template.subject, getExampleData(template.key))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Corpo do Email:</Label>
                              <div className="border rounded-lg overflow-hidden bg-white">
                                <iframe
                                  srcDoc={renderTemplate(template.body_html, getExampleData(template.key))}
                                  className="w-full h-[600px]"
                                  title="Email Preview"
                                  sandbox="allow-same-origin"
                                />
                              </div>
                            </div>

                            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                              <p className="text-sm text-warning">
                                <strong>Nota:</strong> Este é um exemplo com dados fictícios. O email real será preenchido com dados reais do sistema.
                              </p>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

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
                      {template.available_variables.map((variable) => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
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
