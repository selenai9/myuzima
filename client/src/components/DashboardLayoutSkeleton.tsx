import { Skeleton } from './ui/skeleton';
import { Activity } from 'lucide-react';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-[var(--color-healthcare-bg)] overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="w-[280px] border-r border-border/50 bg-white p-4 flex flex-col h-screen">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-healthcare-teal)]/10">
            <Activity className="h-4 w-4 text-[var(--color-healthcare-teal)]" />
          </div>
          <Skeleton className="h-4 w-24 rounded-lg" />
        </div>

        {/* Menu items */}
        <div className="space-y-3 px-2 flex-1">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-3/4 rounded-xl" />
        </div>

        {/* User profile */}
        <div className="pb-8 px-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-2 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-xl" />
            <Skeleton className="h-4 w-32 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>

        {/* Stat cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="healthcare-card border-0 p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-20 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        {/* Main content block */}
        <div className="healthcare-card border-0 p-6">
          <Skeleton className="h-5 w-40 rounded-lg mb-6" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-7 bg-[var(--color-healthcare-teal)]/5 border-t border-border/30">
        <div className="flex items-center justify-center h-full gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-healthcare-teal)]/30 animate-pulse" />
          <Skeleton className="h-2 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}
