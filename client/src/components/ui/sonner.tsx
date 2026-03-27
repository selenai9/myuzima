import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors 
      closeButton
      style={
        {
          /* Core Backgrounds */
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--color-healthcare-text)",
          "--normal-border": "var(--border)",
          
          /* Success Branding (Emerald) */
          "--success-bg": "#ECFDF5",
          "--success-text": "var(--color-healthcare-success)",
          "--success-border": "rgba(16, 185, 129, 0.1)",
          
          /* Info Branding (Your Teal) */
          "--info-bg": "var(--color-healthcare-teal-light)",
          "--info-text": "var(--color-healthcare-deep)",
          "--info-border": "rgba(46, 196, 182, 0.1)",

          /* Error Branding (Medical Red) */
          "--error-bg": "#FEF2F2",
          "--error-text": "#DC2626",
          "--error-border": "rgba(220, 38, 38, 0.1)",

          /* Warning Branding (Amber) */
          "--warning-bg": "#FFFBEB",
          "--warning-text": "#D97706",
          "--warning-border": "rgba(217, 119, 6, 0.1)",
          
          /* Global UI Adjustments */
          "--radius": "12px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
