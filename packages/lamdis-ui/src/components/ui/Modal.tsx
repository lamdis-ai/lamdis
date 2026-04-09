"use client";
import { ReactNode, useEffect } from "react";
import { FiX, FiAlertCircle, FiCheckCircle, FiInfo, FiAlertTriangle } from "react-icons/fi";

export type ModalVariant = "default" | "error" | "success" | "warning" | "info";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  variant?: ModalVariant;
  /** Actions to display at the bottom of the modal */
  actions?: ReactNode;
  /** Size of the modal */
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Whether clicking outside closes the modal */
  closeOnOverlayClick?: boolean;
  /** Make the modal take up most of the vertical space */
  tall?: boolean;
}

const variantStyles: Record<ModalVariant, { icon: typeof FiInfo; iconColor: string; borderColor: string }> = {
  default: { icon: FiInfo, iconColor: "text-slate-400", borderColor: "border-slate-700" },
  error: { icon: FiAlertCircle, iconColor: "text-red-400", borderColor: "border-red-700/50" },
  success: { icon: FiCheckCircle, iconColor: "text-green-400", borderColor: "border-green-700/50" },
  warning: { icon: FiAlertTriangle, iconColor: "text-amber-400", borderColor: "border-amber-700/50" },
  info: { icon: FiInfo, iconColor: "text-blue-400", borderColor: "border-blue-700/50" },
};

const sizeStyles: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  full: "max-w-4xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  variant = "default",
  actions,
  size = "md",
  closeOnOverlayClick = true,
  tall = false,
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const { icon: Icon, iconColor, borderColor } = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      
      {/* Modal */}
      <div
        className={`relative bg-slate-900 border ${borderColor} rounded-xl shadow-xl w-full ${sizeStyles[size]} mx-4 animate-in fade-in zoom-in-95 duration-200 ${tall ? "max-h-[90vh] flex flex-col" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <Icon className={`text-xl ${iconColor}`} />
              <h2 id="modal-title" className="text-lg font-semibold text-slate-100">
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
              aria-label="Close modal"
            >
              <FiX className="text-lg" />
            </button>
          </div>
        )}
        
        {/* Close button if no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <FiX className="text-lg" />
          </button>
        )}
        
        {/* Content */}
        <div className={`px-6 py-4 ${tall ? "flex-1 overflow-y-auto" : ""}`}>
          {children}
        </div>
        
        {/* Actions */}
        {actions && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Specialized error modal for common error scenarios
 */
interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  /** If provided, shows a "Log In" button that redirects to this URL */
  loginUrl?: string;
}

export function ErrorModal({ isOpen, onClose, title = "Error", message, loginUrl }: ErrorModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant="error"
      actions={
        <>
          {loginUrl ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <a
                href={loginUrl}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition"
              >
                Log In
              </a>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              Close
            </button>
          )}
        </>
      }
    >
      <p className="text-slate-300">{message}</p>
    </Modal>
  );
}

/**
 * Specialized auth error modal that offers to redirect to login
 */
interface AuthErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnTo?: string;
}

export function AuthErrorModal({ isOpen, onClose, returnTo }: AuthErrorModalProps) {
  const loginUrl = returnTo 
    ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/login";
    
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Session Expired"
      variant="warning"
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <a
            href={loginUrl}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition"
          >
            Log In
          </a>
        </>
      }
    >
      <p className="text-slate-300">
        Your session has expired or you are not logged in. Please log in again to continue.
      </p>
    </Modal>
  );
}

/**
 * Simple confirmation modal
 */
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant={variant}
      actions={
        <>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg transition disabled:opacity-50 ${
              variant === "error" 
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
            }`}
          >
            {isLoading ? "Loading..." : confirmText}
          </button>
        </>
      }
    >
      <p className="text-slate-300">{message}</p>
    </Modal>
  );
}