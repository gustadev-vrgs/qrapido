"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signOut, type User } from "firebase/auth";
import { collection, getDocs, limit, query, where } from "firebase/firestore";

import { canAccessDashboard } from "@/lib/auth/roles";
import type { AdminAuthState } from "@/lib/auth/types";
import { getFirebaseClientAuth, getFirebaseClientFirestore } from "@/lib/firebase/client";
import { COLLECTION_NAMES, type StaffUser } from "@/lib/types/domain";

interface AuthContextValue extends AdminAuthState {
  firebaseUser: User | null;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readStaffUser(firebaseUser: User): Promise<StaffUser | null> {
  const db = getFirebaseClientFirestore();
  const staffQuery = query(collection(db, COLLECTION_NAMES.staffUsers), where("uid", "==", firebaseUser.uid), where("isActive", "==", true), limit(1));
  const snapshot = await getDocs(staffQuery);

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  return {
    id: document.id,
    ...(document.data() as Omit<StaffUser, "id">)
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [state, setState] = useState<AdminAuthState>({ user: null, staffUser: null, isAuthenticated: false, isLoading: true });

  const refreshSession = useCallback(async () => {
    const auth = getFirebaseClientAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const staffUser = await readStaffUser(currentUser);

    if (!staffUser || !canAccessDashboard(staffUser.role)) {
      await signOut(auth);
      setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false });
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
      isLoading: false
    });
  }, []);

  useEffect(() => {
    const auth = getFirebaseClientAuth();
    void setPersistence(auth, browserLocalPersistence);

    return onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);
      await refreshSession();
    });
  }, [refreshSession]);

  const logout = useCallback(async () => {
    const auth = getFirebaseClientAuth();
    await signOut(auth);
    setState({ user: null, staffUser: null, isAuthenticated: false, isLoading: false });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      firebaseUser,
      refreshSession,
      logout
    }),
    [firebaseUser, refreshSession, state, logout]
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
