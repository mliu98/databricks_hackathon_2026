import { createBrowserRouter, RouterProvider, NavLink, Outlet, Navigate } from 'react-router';
import { PlannerPage } from './pages/PlannerPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { LandingPage } from './pages/LandingPage';
import { ErrorBoundary, RouteErrorPage } from './ErrorBoundary';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ linkClass }: { linkClass: NavLinkClassFn }) {
  return (
    <nav className="flex w-full">
      <NavLink to="/planner" end className={linkClass}>
        Planner
      </NavLink>
      <NavLink to="/scenarios" className={linkClass}>
        Saved scenarios
      </NavLink>
    </nav>
  );
}

function Layout() {
  return (
    <div className="dark flex min-h-screen flex-col bg-background">
      <main className="flex-1 bg-[radial-gradient(circle_at_8%_15%,rgba(142,92,246,0.13),transparent_28%)] p-4 pb-24 md:p-6 md:pb-24">
        <Outlet />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-background/90 backdrop-blur-xl">
        <NavLinks linkClass={navLinkClass} />
      </footer>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/planner" replace />, errorElement: <RouteErrorPage /> },
  { path: '/welcome', element: <LandingPage />, errorElement: <RouteErrorPage /> },
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/planner', element: <PlannerPage /> },
      { path: '/scenarios', element: <ScenariosPage /> },
    ],
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
