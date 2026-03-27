import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Rich colors makes the success/error icons pop
      richColors 
      // Close button for better UX on mobile PWAs
      closeButton
      style={
        {
          /* Core Backgrounds */
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--color-healthcare-text)",
          "--normal-border": "var(--border)",
          
          /* Success Branding */
          "--success-bg": "#ECFDF5",
          "--success-text": "var(--color-healthcare-success)",
          "--success-border": "rgba(16, 185, 129, 0.1)",
          
          /* Primary/Info Branding (Using your Teal) */
          "--info-bg": "var(--color-healthcare-teal-light)",
          "--info-text": "var(--color-healthcare-deep)",
          "--info-border": "rgba(46, 196, 182, 0.1)",
          
          /* Global UI Adjustments */
          "--radius": "12px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
