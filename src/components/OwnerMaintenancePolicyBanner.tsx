import { useState, useEffect } from 'react';
import { MAINTENANCE_POLICY_VERSION, MAINTENANCE_POLICY_HTML } from "@/constants/maintenancePolicy";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export default function OwnerMaintenancePolicyBanner({ ownerId }: { ownerId: string }) {
  const [needsAcceptance, setNeedsAcceptance] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [accepting, setAccepting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('maintenance_policy_acceptances')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('policy_version', MAINTENANCE_POLICY_VERSION)
        .single();
      
      setNeedsAcceptance(!data);
    })();
  }, [ownerId]);

  const acceptPolicy = async () => {
    setAccepting(true);
    try {
      const { error } = await supabase
        .from('maintenance_policy_acceptances')
        .insert({
          owner_id: ownerId,
          policy_version: MAINTENANCE_POLICY_VERSION
        });

      if (error) throw error;

      toast.success('Política aceita com sucesso');
      setNeedsAcceptance(false);
      setOpen(false);
    } catch (error) {
      console.error('Error accepting policy:', error);
      toast.error('Erro ao aceitar política');
    } finally {
      setAccepting(false);
    }
  };

  const openMaintenanceTicket = () => {
    navigate('/novo-ticket?kind=maintenance');
    setOpen(false);
  };

  if (!needsAcceptance) return null;

  return (
    <>
      <Card className="mb-4 border-yellow-400 bg-yellow-50">
        <CardContent className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <b>Política de Manutenção (vigente 01/01/2026):</b> leia e aceite para continuar utilizando o Portal plenamente.
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Ler & Aceitar
            </Button>
            <Button size="sm" onClick={openMaintenanceTicket}>
              Abrir manutenção
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Política de Manutenção</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: MAINTENANCE_POLICY_HTML }} />
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button variant="outline" onClick={openMaintenanceTicket}>
              Abrir manutenção
            </Button>
            <Button onClick={acceptPolicy} disabled={accepting}>
              {accepting ? 'Registrando…' : 'Li e entendi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
