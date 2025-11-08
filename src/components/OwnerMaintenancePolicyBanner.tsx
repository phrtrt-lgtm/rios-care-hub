import { useNavigate } from "react-router-dom";
import { MAINTENANCE_POLICY_HTML } from "@/constants/maintenancePolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function OwnerMaintenancePolicyBanner() {
  const navigate = useNavigate();

  const openMaintenanceTicket = () => {
    navigate('/novo-ticket?kind=maintenance');
  };

  return (
    <Card className="mb-6 border-yellow-400 bg-yellow-50">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3 flex-1">
            <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
            <CardTitle className="text-lg">Política de Manutenção (vigente 01/01/2026)</CardTitle>
          </div>
          <Button onClick={openMaintenanceTicket} className="flex-shrink-0">
            Abrir manutenção
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          className="prose prose-sm max-w-none text-foreground" 
          dangerouslySetInnerHTML={{ __html: MAINTENANCE_POLICY_HTML }} 
        />
      </CardContent>
    </Card>
  );
}
