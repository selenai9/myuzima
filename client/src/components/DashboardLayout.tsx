import { useAuth } from "@/_core/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  ChevronRight,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Emergency Logs", path: "/logs" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/**
 * Healthcare-branded Sync Status Bar
 */
function SyncStatusBar() {
  const { online, syncing } = useSync();
  
  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-[100] py-1.5 px-4 text-[10px] uppercase tracking-widest font-bold flex items-center justify-between transition-all duration-500 border-t backdrop-blur-sm",
      online
        ? "bg-[var(--color-healthcare-teal)]/90 text-white border-[var(--color-healthcare-teal)]/50"
        : "bg-amber-500/90 text-white border-amber-400/50"
    )}>
      <div className="flex items-center gap-2">
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>{online ? "Network Online" : "Offline Mode (Sync Pending)"}</span>
      </div>
      {syncing && (
        <div className="flex items-center gap-2 animate-pulse">
          <RefreshCw size={10} className="animate-spin" />
          <span>Syncing logs...</span>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-healthcare-bg)]">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full page-enter">
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-healthcare-teal)] shadow-lg shadow-[var(--color-healthcare-teal)]/25">
              <Activity className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center text-[var(--color-healthcare-text)]">
              Sign in to continue
            </h1>
            <p className="text-sm text-[var(--color-healthcare-muted)] text-center max-w-sm">
              Access to this dashboard requires authentication.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full rounded-xl bg-[var(--color-healthcare-teal)] hover:bg-[var(--color-healthcare-deep)] text-white font-semibold shadow-lg shadow-[var(--color-healthcare-teal)]/20"
          >
            Sign in
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <SyncStatusBar />
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { online } = useSync();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => { setIsResizing(false); };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0 bg-white" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center border-b border-border/30">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-[var(--color-healthcare-teal-light)] rounded-xl shrink-0 transition-colors duration-200"
              >
                <PanelLeft className="h-4 w-4 text-[var(--color-healthcare-muted)]" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--color-healthcare-teal)]" />
                  <span className="font-bold text-sm text-[var(--color-healthcare-text)]">MyUZIMA</span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 pt-2">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={cn(
                        "h-10 rounded-xl transition-all duration-200",
                        isActive && "bg-[var(--color-healthcare-teal-light)] text-[var(--color-healthcare-deep)] font-semibold"
                      )}
                    >
                      <item.icon className={cn(
                        "h-4 w-4",
                        isActive ? "text-[var(--color-healthcare-teal)]" : "text-[var(--color-healthcare-muted)]"
                      )} />
                      <span className="text-sm">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 mb-6 border-t border-border/30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--color-healthcare-teal-light)] transition-colors w-full text-left group-data-[collapsible=icon]:justify-center">
                  <div className="relative">
                    <Avatar className="h-9 w-9 border border-border/50 shrink-0">
                      <AvatarFallback className="text-xs font-bold bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)]">
                        {user?.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                      online ? "bg-[var(--color-healthcare-success)]" : "bg-amber-500"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate text-[var(--color-healthcare-text)]">
                      {user?.name || "-"}
                    </p>
                    <p className="text-[10px] text-[var(--color-healthcare-muted)] uppercase font-bold tracking-tighter">
                      {online ? "Connected" : "Offline"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive rounded-lg">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={cn(
            "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--color-healthcare-teal)]/20 transition-colors",
            isCollapsed && "hidden"
          )}
          onMouseDown={() => !isCollapsed && setIsResizing(true)}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-[var(--color-healthcare-bg)]">
        {isMobile && (
          <div className="flex border-b border-border/50 h-14 items-center justify-between bg-white/80 backdrop-blur-xl px-3 sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-xl" />
              <Activity className="h-4 w-4 text-[var(--color-healthcare-teal)]" />
              <span className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                {activeMenuItem?.label ?? "Menu"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 p-6 pb-14">{children}</main>
      </SidebarInset>
    </>
  );
}
