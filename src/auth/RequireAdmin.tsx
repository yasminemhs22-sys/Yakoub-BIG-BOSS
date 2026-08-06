import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/Skeleton';

/**
 * Gate for every admin route.
 *
 * This is convenience, not security. Row Level Security is what actually
 * protects the data — Phase 1 proved that an unauthorised session reads
 * nothing. This guard exists so the person sees a login form instead of an
 * empty dashboard full of failed requests.
 *
 * Never treat a passing guard as authorisation. The database decides.
 */
export function RequireAdmin({ permission }: { permission?: string }) {
  const { isAdmin, loading, can } = useAuth();
  const { path } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto max-w-content space-y-4 px-6 py-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    // Remember where they were headed, so signing in returns them there rather
    // than dumping them on the dashboard home.
    return <Navigate to={path('/admin/login')} state={{ from: location.pathname }} replace />;
  }

  if (permission && !can(permission)) {
    return <Navigate to={path('/admin')} replace />;
  }

  return <Outlet />;
}

/**
 * Renders children only if the signed-in admin holds the permission.
 *
 * Use this to hide controls rather than to protect data. A hidden button is a
 * courtesy; the RPC behind it enforces the rule regardless.
 */
export function Can({
  permission,
  any,
  children,
  fallback = null,
}: {
  permission?: string;
  any?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny } = useAuth();
  const allowed = permission ? can(permission) : any ? canAny(...any) : false;
  return <>{allowed ? children : fallback}</>;
}
