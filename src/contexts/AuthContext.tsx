import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface UserRole {
  email: string;
  role: 'admin' | 'viewer';
}

interface AuthContextType {
  user: User | null;
  userRole: UserRole | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const SUPER_ADMIN = 'michelskapp@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        if (currentUser.email === SUPER_ADMIN) {
          setUserRole({ email: currentUser.email, role: 'admin' });
          setLoading(false);
        } else {
          try {
            const docRef = doc(db, 'system', 'users', 'allowed', currentUser.email);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              setUserRole(docSnap.data() as UserRole);
            } else {
              await signOut(auth);
              setUser(null);
              setUserRole(null);
              alert('Acesso negado: Este email não está autorizado no sistema.');
            }
          } catch (error) {
            console.error("Error fetching user role", error);
          } finally {
            setLoading(false);
          }
        }
      } else {
        setUserRole(null);
        setLoading(false);
      }
    });

    // Safety timeout: if loading is still true after 8s, force it false
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('[Auth] Safety timeout triggered — forcing loading=false');
          return false;
        }
        return prev;
      });
    }, 8000);

    return () => {
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      const userEmail = result.user.email;
      if (userEmail && userEmail !== SUPER_ADMIN) {
        const docRef = doc(db, 'system', 'users', 'allowed', userEmail);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          await signOut(auth);
          throw new Error('Acesso negado: Este email não está autorizado no sistema.');
        }
      }
    } catch (error: any) {
      console.error(error);
      if (error.code !== 'auth/popup-closed-by-user') {
        throw error;
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = userRole?.role === 'admin' || user?.email === SUPER_ADMIN;

  return (
    <AuthContext.Provider value={{ user, userRole, loading, loginWithGoogle, logout, isAdmin }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
