import React, { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { UserDto } from '@reachinbox/shared';

interface AuthContextType {
  user: UserDto | null;
  slack: { connected: boolean; teamName?: string; channelName?: string } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetchUser: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['authMe'],
    queryFn: api.auth.getMe,
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.setQueryData(['authMe'], null);
      window.location.href = '/login';
    }
  });

  const user = data?.user || null;
  const slack = data?.slack || null;
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        slack,
        isLoading,
        isAuthenticated,
        refetchUser: refetch,
        logout: () => logoutMutation.mutate()
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
