"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signOut, type User } from "firebase/auth";

import { getStaffValidationMessage, validateAdminStaffUser } from "@/lib/auth/staff-user";
import type { AdminAuthState } from "@/lib/auth/types";
import { getFirebaseClientAuth, getFirebaseClientFirestore } from "@/lib/firebase/client";
import { describeFirebaseError } from "@/lib/data/errors";

interface AuthContextValue extends AdminAuthState {
  firebaseUser: User | null;
  refreshSession: (userOverride?: User | null) => Promise<void>;
  clearAuthError: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [state, setState] = useState<AdminAuthState>({ user: null, staffUser: null, isAuthenticated: false, isLoading: true, authError: null });

  const clearAuthError = useCallback(() => {
    setState((current) => ({ ...current, authError: null }));
  }, []);

  const refreshSession = useCallback(async (userOverride?: User | null) => {
    const auth = getFirebaseClientAuth();
    const currentUser = userOverride === undefined ? auth.currentUser : userOverride;

    if (!currentUser) {
      setState((current) => ({ ...current, user: null, staffUser: null, isAuthenticated: false, isLoading: false }));
      return;
    }

    try {
      const db = getFirebaseClientFirestore();
      const validation = await validateAdminStaffUser(db, {
        uid: currentUser.uid,
        email: currentUser.email
      });

      if (validation.error) {
        await signOut(auth);
        setState({
          user: null,
          staffUser: null,
          isAuthenticated: false,
          isLoading: false,
          authError: getStaffValidationMessage(validation.error)
        });
        return;
      }

      const staffUser = validation.staffUser;

      if (!staffUser) {
        setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false, authError: "Não foi possível validar sua conta administrativa." });
        return;
      }

      setState({
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          role: staffUser.role,
          restaurantId: staffUser.restaurantId,
          staffUserId: staffUser.id,
          name: staffUser.name
        },
        staffUser,
        isAuthenticated: true,
        isLoading: false,
        authError: null
      });
    } catch (error) {
      await signOut(auth);
      setState({
        user: null,
        staffUser: null,
        isAuthenticated: false,
        isLoading: false,
        authError: `Não foi possível validar seu acesso. ${describeFirebaseError(error)}`
      });
    }
  }, []);

  useEffect(() => {
    let auth: ReturnType<typeof getFirebaseClientAuth>;
    try {
      auth = getFirebaseClientAuth();
    } catch (error) {
      // Missing NEXT_PUBLIC_FIREBASE_* variables: explain instead of crashing the page.
      setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false, authError: `Configuração do Firebase ausente neste deploy. ${describeFirebaseError(error)}` });
      return;
    }
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const initializeAuth = async () => {
      // Stay signed in on the restaurant tablet/computer until "Sair" is used.
      await setPersistence(auth, browserLocalPersistence).catch(() => undefined);

      if (!isMounted) {
        return;
      }

      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        setFirebaseUser(nextUser);
        await refreshSession(nextUser);
      });
    };

    void initializeAuth();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [refreshSession]);

  const logout = useCallback(async () => {
    const auth = getFirebaseClientAuth();
    await signOut(auth);
    setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false, authError: null });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      firebaseUser,
      refreshSession,
      clearAuthError,
      logout
    }),
    [clearAuthError, firebaseUser, refreshSession, state, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de AuthProvider.");
  }

  return context;
}
