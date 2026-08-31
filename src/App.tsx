import { lazy, Suspense, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { I18nProvider, isLocale } from "@/lib/i18n";
import { TenantProvider } from "@/contexts/TenantContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import RoleGate from "@/components/RoleGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// CommandPalette removed — now embedded inside WorkspaceShell
const CookieConsentLazy = lazy(() => import("@/components/shared/CookieConsent").then(m => ({ default: m.CookieConsent })));
import { SessionTimeoutWarning } from '@/components/session/SessionTimeoutWarning';
import { useMyBlockedModules, pathToModule } from '@/hooks/api/useModuleAccess';

// Lazy-load ALL pages for fast initial load
const NotFound = lazy(() => import("./pages/NotFound"));
const LoginPage = lazy(() => import("@/pages/auth/Login"));
const SignupPage = lazy(() => import("@/pages/auth/Signup"));
const OAuthCallbackPage = lazy(() => import("@/pages/auth/OAuthCallback"));
const MetaOAuthCallbackPage = lazy(() => import("@/pages/auth/MetaOAuthCallback"));
const DashboardPage = lazy(() => import("@/pages/app/Dashboard"));
const LeadsPage = lazy(() => import("@/pages/app/crm/LeadsPage"));
const DealsPage = lazy(() => import("@/pages/app/crm/DealsPage"));
const ColdCallerPage = lazy(() => import("@/pages/app/marketing/ColdCallerPage"));
const VoiceAgentPage = lazy(() => import("@/pages/app/marketing/VoiceAgentPage"));
const LeadGenerationPage = lazy(() => import("@/pages/app/crm/LeadGenerationPage"));
const IcpPage = lazy(() => import("@/pages/app/crm/IcpPage"));
const EmployeesPage = lazy(() => import("@/pages/app/hr/EmployeesPage"));
const AttendancePage = lazy(() => import("@/pages/app/hr/AttendancePage"));
const TimeTrackingPage = lazy(() => import("@/pages/app/hr/TimeTrackingPage"));
const WorkSchedulePage = lazy(() => import("@/pages/app/hr/WorkSchedulePage"));
const WorkforceDashboardPage = lazy(() => import("@/pages/app/hr/WorkforceDashboardPage"));
const WorkforceReportsPage = lazy(() => import("@/pages/app/hr/WorkforceReportsPage"));
const PayrollPage = lazy(() => import("@/pages/app/hr/PayrollPage"));
const LeavePage = lazy(() => import("@/pages/app/hr/LeavePage"));
const RecruitmentPage = lazy(() => import("@/pages/app/hr/RecruitmentPage"));

const InvoicesPage = lazy(() => import("@/pages/app/finance/InvoicesPage"));
const PaymentsPage = lazy(() => import("@/pages/app/finance/PaymentsPage"));
const TasksPage = lazy(() => import("@/pages/app/work/TasksPage"));
const CalendarPage = lazy(() => import("@/pages/app/work/CalendarPage"));
const InboxPage = lazy(() => import("@/pages/app/work/InboxPage"));
const EmailsPage = lazy(() => import("@/pages/app/email/EmailsPage"));
const TodosPage = lazy(() => import("@/pages/app/email/TodosPage"));
const ClowdBotPage = lazy(() => import("@/pages/app/ClowdBot"));
const AutopilotPage = lazy(() => import("@/pages/app/AutopilotPage"));
const BulkEmailPage = lazy(() => import("@/pages/app/email/BulkEmailPage"));
const CompanySettingsPage = lazy(() => import("@/pages/app/settings/CompanySettings"));
const ProfilePage = lazy(() => import("@/pages/app/settings/ProfilePage"));
const InvitationsPage = lazy(() => import("@/pages/app/settings/InvitationsPage"));
const AdminOverviewPage = lazy(() => import("@/pages/app/admin/Overview"));
const AdminCompaniesPage = lazy(() => import("@/pages/app/admin/AdminCompanies"));
const AdminGatePage = lazy(() => import("@/pages/AdminGate"));
const AdminContactSubmissions = lazy(() => import("@/pages/app/admin/AdminContactSubmissions"));
const AdminDataDeletionRequests = lazy(() => import("@/pages/app/admin/AdminDataDeletionRequests"));
const AdminUsersPage = lazy(() => import("@/pages/app/admin/AdminUsers"));
const AdminSettingsPage = lazy(() => import("@/pages/app/admin/AdminSettings"));
const OnboardingPage = lazy(() => import("@/pages/app/Onboarding"));
const QuotesPage = lazy(() => import("@/pages/app/finance/QuotesPage"));
const EmailTemplatesPage = lazy(() => import("@/pages/app/email/EmailTemplatesPage"));
const AutomationPage = lazy(() => import("@/pages/app/Workflows"));
const WebhooksPage = lazy(() => import("@/pages/app/settings/WebhooksPage"));
const AIConnectionPage = lazy(() => import("@/pages/app/settings/AIConnectionPage"));
const MetaAdsManagePage = lazy(() => import("@/pages/app/marketing/MetaAdsManagePage"));
const MonitoringPage = lazy(() => import("@/pages/app/MonitoringPage"));
const HelpCenterPage = lazy(() => import("@/pages/app/HelpCenterPage"));
const SubscriptionPage = lazy(() => import("@/pages/app/SubscriptionPage"));
const IndexPage = lazy(() => import("@/pages/Index"));
const AcceptInvitePage = lazy(() => import("@/pages/auth/AcceptInvite"));
const JoinCompanyPage = lazy(() => import("@/pages/auth/JoinCompany"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPassword"));
const PrivacyPolicyPage = lazy(() => import("@/pages/legal/PrivacyPolicy"));
const TermsOfServicePage = lazy(() => import("@/pages/legal/TermsOfService"));
const DataProcessingAgreementPage = lazy(() => import("@/pages/legal/DataProcessingAgreement"));

// Lazy-load layouts
const WorkspaceShell = lazy(() => import("@/components/workspace/WorkspaceShell"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const ClientView = lazy(() => import("@/pages/app/clients/ClientView"));
const ClientsListPage = lazy(() => import("@/pages/app/clients/ClientsListPage"));
const ConnectedAppsPage = lazy(() => import("@/pages/app/workspace/ConnectedAppsPage"));
const DocumentsPage = lazy(() => import("@/pages/app/workspace/DocumentsPage"));
const WorkflowStudioPage = lazy(() => import("@/pages/app/workspace/WorkflowStudioPage"));
const IntelligencePage = lazy(() => import("@/pages/app/workspace/IntelligencePage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 min — don't refetch fresh data
      gcTime: 10 * 60 * 1000,         // 10 min cache
      refetchOnWindowFocus: false,     // no flicker on tab switch
      retry: 1,                        // fast fail
    },
  },
});

// Minimal spinner for Suspense boundaries
const PageLoader = () => (
  <div className="min-h-screen grid place-items-center bg-background">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CookieConsentWrapper = () => {
  // Only show cookie consent on public marketing/auth pages. Once the user is
  // inside `/app/`, hide it so it doesn't cover the rail, logout menu, or form
  // submit buttons (especially on mobile viewports).
  const location = useLocation();
  if (location.pathname.includes('/app/')) return null;
  const loc = location.pathname.split('/')[1];
  const locale = isLocale(loc) ? loc : 'en';
  return (
    <I18nProvider locale={locale}>
      <Suspense fallback={null}><CookieConsentLazy /></Suspense>
    </I18nProvider>
  );
};

const LocaleLayout = () => {
  const params = useParams();
  // `:locale` greedily matches any single path segment (e.g. /foobar), so an
  // unrecognized segment must render 404 here rather than fall through to the
  // index route — otherwise every unknown one-segment URL silently renders
  // the homepage instead of a real 404.
  if (!isLocale(params.locale)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <NotFound />
      </Suspense>
    );
  }
  return (
    <I18nProvider locale={params.locale}>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </I18nProvider>
  );
};

// Gates direct URL navigation the same way the sidebar is gated — hiding a
// nav item is cosmetic on its own; a restricted user could otherwise still
// reach the page by typing/bookmarking the URL.
const ModuleAccessGuard = ({ children }: { children: ReactNode }) => {
  const params = useParams();
  const location = useLocation();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const blockedModules = useMyBlockedModules();

  const base = `/${locale}/app/`;
  const relativePath = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
  const module = pathToModule(relativePath);

  if (module && blockedModules.has(module)) {
    return <Navigate to={`/${locale}/app/dashboard`} replace />;
  }
  return <>{children}</>;
};

const AppRouteLayout = () => {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  return (
    <Suspense fallback={<PageLoader />}>
      <WorkspaceShell basePath={`/${locale}/app`}>
        <ModuleAccessGuard>
          <Outlet />
        </ModuleAccessGuard>
      </WorkspaceShell>
    </Suspense>
  );
};

const AdminRouteLayout = () => {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  // Verify admin was authenticated through the gate with secret code
  const verified = sessionStorage.getItem('admin_verified');
  if (!verified) {
    return <Navigate to={`/${locale}/admin`} replace />;
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminLayout basePath={`/${locale}`}>
        <Outlet />
      </AdminLayout>
    </Suspense>
  );
};

const App = () => (
  <ErrorBoundary>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <TenantProvider>
        <CurrencyProvider>
          <Toaster />
          <Sonner />
          <Analytics />
          <SpeedInsights />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/en" replace />} />
              <Route path="/auth/meta/callback" element={<Suspense fallback={<PageLoader />}><MetaOAuthCallbackPage /></Suspense>} />
              <Route path="/:locale" element={<LocaleLayout />}>
                <Route path="" element={<IndexPage />} />
                <Route path="admin">
                  <Route index element={<AdminGatePage />} />
                  <Route element={<AdminRouteLayout />}>
                    <Route path="overview" element={<AdminOverviewPage />} />
                    <Route path="companies" element={<AdminCompaniesPage />} />
                    <Route path="contacts" element={<AdminContactSubmissions />} />
                    <Route path="data-deletion-requests" element={<AdminDataDeletionRequests />} />
                    <Route path="users" element={<AdminUsersPage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />
                  </Route>
                </Route>
                <Route path="auth/login" element={<LoginPage />} />
                <Route path="auth/signup" element={<SignupPage />} />
                <Route path="auth/callback" element={<OAuthCallbackPage />} />
                <Route path="auth/meta/callback" element={<MetaOAuthCallbackPage />} />
                <Route path="auth/register-company" element={<Navigate to="../auth/signup" replace />} />
                <Route path="auth/join-company" element={<JoinCompanyPage />} />
                <Route path="auth/join" element={<JoinCompanyPage />} />
                <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="auth/reset-password" element={<ResetPasswordPage />} />
                <Route path="invite" element={<AcceptInvitePage />} />
                <Route path="privacy" element={<PrivacyPolicyPage />} />
                <Route path="terms" element={<TermsOfServicePage />} />
                <Route path="dpa" element={<DataProcessingAgreementPage />} />
                <Route
                  path="app"
                  element={
                    <ProtectedRoute>
                      <AppRouteLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                  <Route path="onboarding" element={<OnboardingPage />} />
                  <Route path="crm/leads" element={<ErrorBoundary><LeadsPage /></ErrorBoundary>} />
                  <Route path="crm/pipeline" element={<Navigate to="../crm/deals?view=board" replace />} />
                  <Route path="crm/deals" element={<ErrorBoundary><DealsPage /></ErrorBoundary>} />
                  <Route path="crm/lead-generation" element={<ErrorBoundary><LeadGenerationPage /></ErrorBoundary>} />
                  <Route path="crm/icp" element={<ErrorBoundary><IcpPage /></ErrorBoundary>} />
                  <Route path="clients" element={<ErrorBoundary><ClientsListPage /></ErrorBoundary>} />
                  <Route path="clients/:id" element={<ErrorBoundary><ClientView /></ErrorBoundary>} />

                  <Route path="finance/invoices" element={<ErrorBoundary><InvoicesPage /></ErrorBoundary>} />
                  <Route path="finance/quotes" element={<ErrorBoundary><QuotesPage /></ErrorBoundary>} />
                  <Route path="finance/payments" element={<ErrorBoundary><PaymentsPage /></ErrorBoundary>} />
                  <Route path="hr/employees" element={<RoleGate role="company_admin" allowedRoles={['company_admin', 'system_admin', 'manager']}><ErrorBoundary><EmployeesPage /></ErrorBoundary></RoleGate>} />
                  <Route path="hr/attendance" element={<ErrorBoundary><AttendancePage /></ErrorBoundary>} />
                  <Route path="hr/time-tracking" element={<ErrorBoundary><TimeTrackingPage /></ErrorBoundary>} />
                  <Route path="hr/work-schedule" element={<ErrorBoundary><WorkSchedulePage /></ErrorBoundary>} />
                  <Route path="hr/workforce" element={<RoleGate role="company_admin" allowedRoles={['company_admin', 'system_admin', 'manager']}><ErrorBoundary><WorkforceDashboardPage /></ErrorBoundary></RoleGate>} />
                  <Route path="hr/reports" element={<RoleGate role="company_admin" allowedRoles={['company_admin', 'system_admin', 'manager']}><ErrorBoundary><WorkforceReportsPage /></ErrorBoundary></RoleGate>} />
                  <Route path="hr/payroll" element={<RoleGate role="company_admin" allowedRoles={['company_admin', 'system_admin']}><ErrorBoundary><PayrollPage /></ErrorBoundary></RoleGate>} />
                  <Route path="hr/leave" element={<ErrorBoundary><LeavePage /></ErrorBoundary>} />
                  <Route path="hr/recruitment" element={<RoleGate role="company_admin" allowedRoles={['company_admin', 'system_admin', 'manager']}><ErrorBoundary><RecruitmentPage /></ErrorBoundary></RoleGate>} />
                  <Route path="work/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
                  <Route path="work/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                  <Route path="work/inbox" element={<ErrorBoundary><InboxPage /></ErrorBoundary>} />
                  <Route path="email/emails" element={<ErrorBoundary><EmailsPage /></ErrorBoundary>} />
                  <Route path="email/inbox" element={<Navigate to="../email/emails" replace />} />
                  <Route path="email/todos" element={<Navigate to="../work/tasks" replace />} />
                  <Route path="tasks" element={<Navigate to="../work/tasks" replace />} />
                  <Route path="settings" element={<Navigate to="../settings/company" replace />} />
                  <Route path="marketing/meta-ads" element={<ErrorBoundary><MetaAdsManagePage /></ErrorBoundary>} />
                  <Route path="marketing/cold-caller" element={<ErrorBoundary><ColdCallerPage /></ErrorBoundary>} />
                  <Route path="marketing/voice-agent" element={<ErrorBoundary><VoiceAgentPage /></ErrorBoundary>} />
                  <Route path="ai/media" element={<Navigate to="../marketing/meta-ads" replace />} />
                  <Route path="pa" element={<ErrorBoundary><ClowdBotPage /></ErrorBoundary>} />
                  <Route path="autopilot" element={<ErrorBoundary><AutopilotPage /></ErrorBoundary>} />
                  <Route path="clowdbot" element={<Navigate to="../pa" replace />} />
                  <Route path="email/bulk" element={<ErrorBoundary><BulkEmailPage /></ErrorBoundary>} />
                  <Route path="email/templates" element={<ErrorBoundary><EmailTemplatesPage /></ErrorBoundary>} />
                  <Route path="settings/company" element={<ErrorBoundary><CompanySettingsPage /></ErrorBoundary>} />
                  <Route path="settings/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
                  <Route path="settings/invitations" element={<RoleGate role="company_admin"><ErrorBoundary><InvitationsPage /></ErrorBoundary></RoleGate>} />
                  <Route path="settings/webhooks" element={<RoleGate role="company_admin"><ErrorBoundary><WebhooksPage /></ErrorBoundary></RoleGate>} />
                  <Route path="settings/ai" element={<RoleGate role="company_admin"><ErrorBoundary><AIConnectionPage /></ErrorBoundary></RoleGate>} />
                  <Route path="workspace/connected-apps" element={<ErrorBoundary><ConnectedAppsPage /></ErrorBoundary>} />
                  <Route path="workspace/documents" element={<ErrorBoundary><DocumentsPage /></ErrorBoundary>} />
                  <Route path="workspace/studio" element={<ErrorBoundary><WorkflowStudioPage /></ErrorBoundary>} />
                  <Route path="workspace/intelligence" element={<ErrorBoundary><IntelligencePage /></ErrorBoundary>} />
                  <Route path="monitoring" element={<RoleGate role="company_admin"><ErrorBoundary><MonitoringPage /></ErrorBoundary></RoleGate>} />
                  <Route path="help" element={<ErrorBoundary><HelpCenterPage /></ErrorBoundary>} />
                  <Route path="subscription" element={<ErrorBoundary><SubscriptionPage /></ErrorBoundary>} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
            </Routes>
            <CookieConsentWrapper />
          </BrowserRouter>
          <SessionTimeoutWarning />
        </CurrencyProvider>
        </TenantProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
  </ErrorBoundary>
);

export default App;