import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface ReportStepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export function ReportStepIndicator({ steps, currentStep }: ReportStepIndicatorProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                  currentStep > step.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : currentStep === step.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground'
                )}
              >
                {currentStep > step.id ? <Check className="h-5 w-5" /> : <span className="text-sm font-semibold">{step.id}</span>}
              </div>
              <div className="mt-2 text-center">
                <p className={cn('text-sm font-medium transition-colors', currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground')}>{step.title}</p>
                <p className="text-xs text-muted-foreground hidden sm:block">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-4 mt-[-24px] transition-colors duration-300', currentStep > step.id ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
