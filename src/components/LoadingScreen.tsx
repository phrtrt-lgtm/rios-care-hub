import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export const LoadingScreen = ({ message, size = "md" }: LoadingScreenProps) => {
  const logoSizes = {
    sm: "h-12 md:h-14",
    md: "h-16 md:h-20",
    lg: "h-20 md:h-24"
  };

  const spinnerSizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10"
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6">
      <img src="/logo.png" alt="RIOS" className={logoSizes[size]} />
      <Loader2 className={`${spinnerSizes[size]} animate-spin text-primary`} />
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </div>
  );
};
