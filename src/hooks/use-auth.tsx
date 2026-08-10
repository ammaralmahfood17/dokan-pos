import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { notifyDataChanged } from "@/lib/realtime";

export interface AuthUser {
  name?: string;
  email?: string;
}

interface AuthCtx {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  /**
   * Supabase auth — drop-in for the old Convex `signIn(provider, params)`.
   * - ("email-otp", FormData with `email`)  → sends a one-time code
   * - ("email-otp", FormData with email+code) → verifies the code
   * - ("anonymous")                          → guest session
   */
  signIn: (provider: string, formData?: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthCtx>({
  isLoading: true,
  isAuthenticated: false,
  user: null,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("[dokan] failed to load session:", err);
        setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Auth affects every project-scoped query.
      notifyDataChanged();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (provider: string, formData?: FormData) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Keys tab.",
      );
    }

    if (provider === "anonymous") {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return;
    }

    // email-otp: first step sends the code, second step verifies it.
    const email = String(formData?.get("email") ?? "").trim();
    if (!email) throw new Error("Email is required.");
    const code = String(formData?.get("code") ?? "").trim();

    if (code) {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const user = session?.user
    ? {
        name:
          (session.user.user_metadata?.full_name as string | undefined) ??
          (session.user.user_metadata?.name as string | undefined),
        email: session.user.email ?? undefined,
      }
    : null;

  return (
    <AuthCtx.Provider
      value={{
        isLoading,
        isAuthenticated: Boolean(session?.user),
        user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
