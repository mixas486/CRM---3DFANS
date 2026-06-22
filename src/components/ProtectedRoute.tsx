import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ children, requireAdmin = false }: { children?: React.ReactNode; requireAdmin?: boolean }) => {
    const { user, loading, isAdmin } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="h-screen bg-[#050816] flex items-center justify-center text-white">Carregando...</div>;
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requireAdmin && !isAdmin) {
         return <Navigate to="/dashboard" replace />;
    }

    // Layout route (no children prop) → render <Outlet /> for nested routes
    // Wrapper route (has children) → render children
    return children ? <>{children}</> : <Outlet />;
};
