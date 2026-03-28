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
import { ComponentType, createContext, useContext } from "react";
import "./i18n/config";

import { useAuth } from "./hooks/useAuth";
import { SecureLoader } from "./components/SecureLoader";

// Auth Context
export const AuthContext = createContext<{
  isAuthenticated: boolean;
  setAuthenticated: (val: boolean) => void;
}>({ isAuthenticated: false, setAuthenticated: () => {} });

export const useAuthContext = () => useContext(AuthContext);

function ProtectedRoute({ component: Component, isAuthenticated, ...rest }: { component: ComponentType; isAuthenticated: boolean; path: string }) {
  return (
    <Route {...rest}>
      {isAuthenticated ? <Component /> : <Home />}
    </Route>
  );
}

function Router({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/patient/register"} component={PatientRegister} />
      <ProtectedRoute path={"/patient/profile"} component={PatientProfile} isAuthenticated={isAuthenticated} />
      <ProtectedRoute path={"/responder/scan"} component={ResponderScan} isAuthenticated={isAuthenticated} />
      <ProtectedRoute path={"/admin"} component={AdminDashboard} isAuthenticated={isAuthenticated} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { loading, isAuthenticated, setAuthenticated } = useAuth();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AuthContext.Provider value={{ isAuthenticated, setAuthenticated }}>
            {loading ? (
              <SecureLoader />
            ) : (
              <Router isAuthenticated={isAuthenticated} />
            )}
          </AuthContext.Provider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
