import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { ComponentType, LazyExoticComponent } from "react";

type LazyComponent = LazyExoticComponent<ComponentType<object>>;

export function ProtectedRoute({
  path,
  component: Component,
  requiredRole,
}: {
  path: string;
  component: ComponentType<object> | LazyComponent;
  requiredRole?: string[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    // Redirect to appropriate auth page based on required role
    const authPath = requiredRole?.includes('candidate') ? '/candidate-auth' : '/auth';
    return (
      <Route path={path}>
        <Redirect to={authPath} />
      </Route>
    );
  }

  if (requiredRole && !requiredRole.includes(user.role)) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </div>
      </Route>
    );
  }

  return <Route path={path}><Component /></Route>;
}