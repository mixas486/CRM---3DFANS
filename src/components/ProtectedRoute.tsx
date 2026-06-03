import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { auth } from '../lib/firebase';

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && user.email !== 'michelskapp@gmail.com') {
      auth.signOut();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user || user.email !== 'michelskapp@gmail.com') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
