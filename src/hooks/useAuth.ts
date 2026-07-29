import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, createUserSession, updateUserSessionLogout } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Role as UserRole } from '@/lib/roles';


const normalizeRole = (value: unknown): UserRole | null => {
  const role = String(value ?? '').toLowerCase().trim();
  if (role === 'owner' || role === 'manager' || role === 'salesman') {
    return role;
  }
  return null;
};

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }

        if (user) {
          setUser(user);
          if (user.id) {
            previousUserIdRef.current = user.id;
          }
          
          // Fetch user role from database
          const { data, error: dbError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

          if (dbError) {
            console.error('Error fetching user role:', dbError);
          } else if (data) {
            const dbRole = normalizeRole(data.role);
            const metaRole = normalizeRole(
              user.user_metadata?.role ?? user.app_metadata?.role
            );
            const resolvedRole = dbRole ?? metaRole;
            if (resolvedRole) {
              setUserRole(resolvedRole);
            }
          }
        } else {
          setUser(null);
          setUserRole(null);
        }
      } catch (err) {
        console.error('Error getting user:', err);
        setError('Failed to load user');
      } finally {
        setLoading(false);
      }
    };

    getUser();

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Track login session on SIGNED_IN event
          if (event === 'SIGNED_IN') {
            try {
              const { createUserSession } = await import('@/lib/supabase');
              await createUserSession(session.user.id);
            } catch (error) {
              console.error('Failed to track login session:', error);
            }
          }
          
          const { data } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();
          
          if (data) {
            const dbRole = normalizeRole(data.role);
            const metaRole = normalizeRole(
              session.user.user_metadata?.role ?? session.user.app_metadata?.role
            );
            const resolvedRole = dbRole ?? metaRole;
            if (resolvedRole) {
              setUserRole(resolvedRole);
            }
          }
        } else {
          // Track logout session on SIGNED_OUT event
          if (event === 'SIGNED_OUT' && previousUserIdRef.current) {
            try {
              const { updateUserSessionLogout } = await import('@/lib/supabase');
              await updateUserSessionLogout(previousUserIdRef.current);
            } catch (error) {
              console.error('Failed to track logout session:', error);
            }
            previousUserIdRef.current = null;
          }
          setUserRole(null);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return false;
      }

      if (data.user) {
        setUser(data.user);
        
        // Fetch user role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (userData) {
          const dbRole = normalizeRole(userData.role);
          const metaRole = normalizeRole(
            data.user.user_metadata?.role ?? data.user.app_metadata?.role
          );
          const resolvedRole = dbRole ?? metaRole;
          if (resolvedRole) {
            setUserRole(resolvedRole);
          }

          // Track login session
          try {
            await createUserSession(data.user.id);
          } catch (error) {
            console.error('Failed to track login session:', error);
          }

          // Redirect to appropriate dashboard
          const dashboardRoute = {
            owner: '/owner',
            manager: '/manager',
            salesman: '/salesman',
          };
          navigate(dashboardRoute[resolvedRole as UserRole] || '/');
        }
      }

      return true;
    } catch (err) {
      setError('Login failed');
      return false;
    }
  };

  const signup = async (email: string, password: string, fullName: string, role: UserRole) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return false;
      }

      if (data.user) {
        // Create user profile in database
        const { error: profileError } = await supabase
          .from('users')
          .insert([{
            id: data.user.id,
            email,
            full_name: fullName,
            role,
          }]);

        if (profileError) {
          setError(profileError.message);
          return false;
        }

        setUser(data.user);
        const normalized = normalizeRole(role);
        if (normalized) {
          setUserRole(normalized);
        }
        
        // Redirect to appropriate dashboard
        const dashboardRoute = {
          owner: '/owner',
          manager: '/manager',
          salesman: '/salesman',
        };
        navigate(dashboardRoute[normalized as UserRole] || '/login');
      }

      return true;
    } catch (err) {
      setError('Signup failed');
      return false;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      
      // Track logout session before signing out
      if (user?.id) {
        try {
          await updateUserSessionLogout(user.id);
        } catch (error) {
          console.error('Failed to track logout session:', error);
        }
      }
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        setError(error.message);
        return false;
      }

      setUser(null);
      setUserRole(null);
      navigate('/');
      return true;
    } catch (err) {
      setError('Logout failed');
      return false;
    }
  };

  return {
    user,
    userRole,
    loading,
    error,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
  };
};

export const useProtectedRoute = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  return { loading };
};
