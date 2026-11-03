export const adminRoutes = ['rooms', 'logs', 'accounts', 'config', 'scenarios', 'test-rooms'] as const;
export type AdminRoute = typeof adminRoutes[number];
export function resolveRoute(hash: string): AdminRoute {
  const value = hash.replace(/^#\/?/, ''); return adminRoutes.includes(value as AdminRoute) ? value as AdminRoute : 'rooms';
}

let blocker:(()=>boolean)|null=null;
export function setAdminRouteBlocker(next:(()=>boolean)|null){blocker=next;}
export function allowAdminRoute(){return !blocker||blocker();}
