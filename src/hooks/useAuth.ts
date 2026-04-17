import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

async function checkAdmin(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncUserState = async (currentUser: User | null) => {
      if (!mounted) return;

      setUser(currentUser);

      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const admin = await checkAdmin(currentUser.id);

      if (!mounted) return;
      setIsAdmin(admin);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUserState(session?.user ?? null);
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => syncUserState(session?.user ?? null))
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // mantém limpeza local mesmo se a rede falhar
    }
    setUser(null);
    setIsAdmin(false);
  };

  return { user, loading, isAdmin, signOut };
}
