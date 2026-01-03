import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";
import { createElement } from "react";

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const showSuccessToast = (message: string, options?: ToastOptions) => {
  toast.success(message, {
    icon: createElement(CheckCircle2, { className: "h-5 w-5 text-green-500" }),
    description: options?.description,
    duration: options?.duration || 4000,
    action: options?.action ? {
      label: options.action.label,
      onClick: options.action.onClick,
    } : undefined,
    className: "!bg-green-500/10 !border-green-500/30",
  });
};

export const showErrorToast = (message: string, options?: ToastOptions) => {
  toast.error(message, {
    icon: createElement(XCircle, { className: "h-5 w-5 text-destructive" }),
    description: options?.description,
    duration: options?.duration || 5000,
    action: options?.action ? {
      label: options.action.label,
      onClick: options.action.onClick,
    } : undefined,
    className: "!bg-destructive/10 !border-destructive/30",
  });
};

export const showWarningToast = (message: string, options?: ToastOptions) => {
  toast.warning(message, {
    icon: createElement(AlertTriangle, { className: "h-5 w-5 text-yellow-500" }),
    description: options?.description,
    duration: options?.duration || 4500,
    action: options?.action ? {
      label: options.action.label,
      onClick: options.action.onClick,
    } : undefined,
    className: "!bg-yellow-500/10 !border-yellow-500/30",
  });
};

export const showInfoToast = (message: string, options?: ToastOptions) => {
  toast.info(message, {
    icon: createElement(Info, { className: "h-5 w-5 text-blue-500" }),
    description: options?.description,
    duration: options?.duration || 4000,
    action: options?.action ? {
      label: options.action.label,
      onClick: options.action.onClick,
    } : undefined,
    className: "!bg-blue-500/10 !border-blue-500/30",
  });
};

export const showLoadingToast = (message: string) => {
  return toast.loading(message, {
    icon: createElement(Loader2, { className: "h-5 w-5 animate-spin text-primary" }),
  });
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

export const updateToast = (toastId: string | number, message: string, type: "success" | "error" = "success") => {
  if (type === "success") {
    toast.success(message, {
      id: toastId,
      icon: createElement(CheckCircle2, { className: "h-5 w-5 text-green-500" }),
      className: "!bg-green-500/10 !border-green-500/30",
    });
  } else {
    toast.error(message, {
      id: toastId,
      icon: createElement(XCircle, { className: "h-5 w-5 text-destructive" }),
      className: "!bg-destructive/10 !border-destructive/30",
    });
  }
};
