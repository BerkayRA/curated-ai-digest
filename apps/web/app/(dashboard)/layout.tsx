import { AdminShell } from '@/components/shell/AdminShell';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Authenticated dashboard pages (/issues, /subscribers, /settings) render inside
// the branded admin shell (sidebar + topbar). Public pages (/login, /unsubscribe)
// live outside this group and get the chrome-free root layout instead.
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <AdminShell>{children}</AdminShell>;
}
