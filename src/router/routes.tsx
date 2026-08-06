import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LocaleLayout, RootRedirect } from './LocaleLayout';
import { NotFound } from './NotFound';
import { Skeleton } from '@/components/Skeleton';
import { RequireAdmin } from '@/auth/RequireAdmin';
import { StorefrontLayout } from '@/components/storefront/Layout';

/**
 * Route table.
 *
 * Every admin page is lazily imported, so a customer browsing t-shirts never
 * downloads the dashboard (D-232). The bundler enforces that split; discipline
 * alone would not.
 *
 * `RequireAdmin` guards the admin tree, and individual routes can additionally
 * demand a permission. Both are conveniences: Row Level Security is what
 * actually protects the data.
 */
const Home = lazy(() => import('@/pages/storefront/Home'));
const Category = lazy(() => import('@/pages/storefront/Category'));
const Product = lazy(() => import('@/pages/storefront/Product'));
const Cart = lazy(() => import('@/pages/storefront/Cart'));
const Checkout = lazy(() => import('@/pages/storefront/Checkout'));
const OrderConfirmed = lazy(() => import('@/pages/storefront/OrderConfirmed'));
const TrackOrder = lazy(() => import('@/pages/storefront/TrackOrder'));
const CmsPage = lazy(() => import('@/pages/storefront/CmsPage'));
const AdminLogin = lazy(() => import('@/pages/admin/Login'));
const AdminShell = lazy(() => import('@/pages/admin/AdminShell'));
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminSettings = lazy(() => import('@/pages/admin/Settings'));
const AdminMedia = lazy(() => import('@/pages/admin/Media'));
const AdminContent = lazy(() => import('@/pages/admin/Content'));
const AdminCatalogue = lazy(() => import('@/pages/admin/Catalogue'));
const AdminProductEditor = lazy(() => import('@/pages/admin/ProductEditor'));
const AdminTaxonomy = lazy(() => import('@/pages/admin/Taxonomy'));
const AdminOrders = lazy(() => import('@/pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('@/pages/admin/OrderDetail'));
const AdminIntegrations = lazy(() => import('@/pages/admin/Integrations'));
const AdminSecurity = lazy(() => import('@/pages/admin/Security'));
const AdminDelivery = lazy(() => import('@/pages/admin/Delivery'));
const AdminInventory = lazy(() => import('@/pages/admin/Inventory'));
const AdminAccess = lazy(() => import('@/pages/admin/Access'));
const AdminAudit = lazy(() => import('@/pages/admin/Audit'));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-content px-6 py-16">
      <Skeleton className="mb-6 h-10 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const lazyRoute = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  {
    path: '/:locale',
    element: <LocaleLayout />,
    children: [
      {
        element: <StorefrontLayout />,
        children: [
          { index: true, element: lazyRoute(<Home />) },
          { path: 'c/:slug', element: lazyRoute(<Category />) },
          { path: 'product/:slug', element: lazyRoute(<Product />) },
          { path: 'cart', element: lazyRoute(<Cart />) },
          { path: 'checkout', element: lazyRoute(<Checkout />) },
          { path: 'order/:reference', element: lazyRoute(<OrderConfirmed />) },
          { path: 'track', element: lazyRoute(<TrackOrder />) },
          { path: 'p/:slug', element: lazyRoute(<CmsPage />) },
        ],
      },

      { path: 'admin/login', element: lazyRoute(<AdminLogin />) },

      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          {
            element: lazyRoute(<AdminShell />),
            children: [
              { index: true, element: lazyRoute(<Dashboard />) },
              {
                path: 'content',
                element: <RequireAdmin permission="content.manage" />,
                children: [
                  { index: true, element: lazyRoute(<AdminContent />) },
                  { path: 'media', element: lazyRoute(<AdminMedia />) },
                ],
              },
              {
                path: 'orders',
                element: <RequireAdmin permission="orders.view" />,
                children: [
                  { index: true, element: lazyRoute(<AdminOrders />) },
                  { path: ':id', element: lazyRoute(<AdminOrderDetail />) },
                ],
              },
              {
                path: 'delivery',
                element: <RequireAdmin permission="delivery.manage" />,
                children: [{ index: true, element: lazyRoute(<AdminDelivery />) }],
              },
              {
                path: 'inventory',
                element: <RequireAdmin permission="inventory.manage" />,
                children: [{ index: true, element: lazyRoute(<AdminInventory />) }],
              },
              {
                path: 'access',
                element: <RequireAdmin permission="admins.manage" />,
                children: [{ index: true, element: lazyRoute(<AdminAccess />) }],
              },
              {
                path: 'audit',
                element: <RequireAdmin permission="audit.view" />,
                children: [{ index: true, element: lazyRoute(<AdminAudit />) }],
              },
              {
                path: 'security',
                element: <RequireAdmin permission="audit.view" />,
                children: [{ index: true, element: lazyRoute(<AdminSecurity />) }],
              },
              {
                path: 'integrations',
                element: <RequireAdmin permission="orders.export" />,
                children: [{ index: true, element: lazyRoute(<AdminIntegrations />) }],
              },
              {
                path: 'catalogue',
                element: <RequireAdmin permission="catalogue.manage" />,
                children: [
                  { index: true, element: lazyRoute(<AdminCatalogue />) },
                  { path: 'taxonomy', element: lazyRoute(<AdminTaxonomy />) },
                  { path: ':id', element: lazyRoute(<AdminProductEditor />) },
                ],
              },
              {
                path: 'settings',
                element: <RequireAdmin permission="settings.manage" />,
                children: [{ index: true, element: lazyRoute(<AdminSettings />) }],
              },
              // Phases 4-9 mount their sections here, each with its own
              // `RequireAdmin permission="..."` where the section needs one.
            ],
          },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <RootRedirect /> },
]);
