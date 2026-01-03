import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "inline" | "overlay";
}

export const LoadingScreen = ({ message, size = "md", variant = "full" }: LoadingScreenProps) => {
  const logoSizes = {
    sm: "h-12 md:h-14",
    md: "h-16 md:h-20",
    lg: "h-20 md:h-24"
  };

  const spinnerSizes = {
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  const containerClass = {
    full: "flex min-h-screen flex-col items-center justify-center bg-background gap-6",
    inline: "flex flex-col items-center justify-center py-12 gap-4",
    overlay: "fixed inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-6 z-50"
  };

  return (
    <div className={cn(containerClass[variant], "animate-fade-in")}>
      <img 
        src="/logo.png" 
        alt="RIOS" 
        className={cn(logoSizes[size], "animate-pulse-subtle")} 
      />
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <Loader2 className={cn(spinnerSizes[size], "animate-spin text-primary relative z-10")} />
      </div>
      {message && (
        <p className="text-muted-foreground text-sm animate-fade-in animate-delay-200">
          {message}
        </p>
      )}
    </div>
  );
};

// Mini loading spinner for inline use
export const LoadingSpinner = ({ 
  size = "default",
  className 
}: { 
  size?: "sm" | "default" | "lg";
  className?: string;
}) => {
  const sizes = {
    sm: "h-4 w-4",
    default: "h-5 w-5",
    lg: "h-6 w-6"
  };

  return (
    <Loader2 className={cn(sizes[size], "animate-spin text-primary", className)} />
  );
};
