import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="w-[280px] border-r border-border bg-background p-4 flex flex-col h-screen">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Menu items */}
        <div className="space-y-4 px-2 flex-1">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>

        {/* User profile area - Adjusted for SyncStatusBar height */}
        <div className="pb-8 px-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>

        {/* Content blocks */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>

      {/* Status Bar Placeholder to prevent layout shift */}
      <div className="fixed bottom-0 left-0 right-0 h-6 bg-muted/30 border-t border-border animate-pulse" />
    </div>
  );
}
