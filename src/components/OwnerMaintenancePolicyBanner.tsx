import { useState } from "react";
import { MAINTENANCE_POLICY_HTML } from "@/constants/maintenancePolicy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OwnerMaintenancePolicyBanner() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="mb-6 border-yellow-400 bg-yellow-50">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
            <CardTitle className="text-lg">Política de Manutenção</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100"
          >
            {isOpen ? (
              <>
                Fechar <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                Ver detalhes <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          <div 
            className="prose prose-sm max-w-none text-foreground" 
            dangerouslySetInnerHTML={{ __html: MAINTENANCE_POLICY_HTML }} 
          />
        </CardContent>
      )}
    </Card>
  );
}
