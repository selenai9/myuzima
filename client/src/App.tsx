import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PatientRegister from "./pages/PatientRegister";
import PatientProfile from "./pages/PatientProfile";
import ResponderScan from "./pages/ResponderScan";
import AdminDashboard from "./pages/AdminDashboard";
import "./i18n/config";

// 1. Import new hook and loader
import { useAuth } from "./hooks/useAuth"; 
import { SecureLoader } from "./components/SecureLoader";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/patient/register"} component={PatientRegister} />
      <Route path={"/patient/profile"} component={PatientProfile} />
      <Route path={"/responder/scan"} component={ResponderScan} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // 2. Start the security check at the very top level
  const { loading } = useAuth();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          
          {/* 3. The Security Guard logic */}
          {loading ? (
            <SecureLoader />
          ) : (
            <Router />
          )}
          
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
