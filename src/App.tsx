import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/contexts/I18nContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PermissionRoute } from "@/components/PermissionRoute";
import { attachGlobalRefreshListeners } from "@/lib/dataSync";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AppShell = lazy(() => import("@/components/layout/AppShell"));
const AuthPage = lazy(() => import("@/pages/auth/Auth"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Pricing = lazy(() => import("@/pages/pricing/Pricing"));
const Trust = lazy(() => import("@/pages/Trust"));
const Dashboard = lazy(() => import("@/pages/dashboard/Dashboard"));
const PatientsPage = lazy(() => import("@/pages/patients/Patients"));
const PatientProfile = lazy(() => import("@/pages/patients/PatientProfile"));
const CalendarPage = lazy(() => import("@/pages/calendar/CalendarPage"));
const QueuePage = lazy(() => import("@/pages/queue/Queue"));
const QueueAuditPage = lazy(() => import("@/pages/queue/QueueAudit"));
const QueueSelfAuditPage = lazy(() => import("@/pages/queue/QueueSelfAudit"));
const AppointmentDetailPage = lazy(() => import("@/pages/appointments/AppointmentDetail"));
const Invoices = lazy(() => import("@/pages/invoices/Invoices"));
const InvoiceDetail = lazy(() => import("@/pages/invoices/InvoiceDetail"));
const OutstandingDebts = lazy(() => import("@/pages/invoices/OutstandingDebts"));
const Payments = lazy(() => import("@/pages/payments/Payments"));
const Treasury = lazy(() => import("@/pages/treasury/Treasury"));
const TreasuryDailyClose = lazy(() => import("@/pages/treasury/DailyClose"));
const Expenses = lazy(() => import("@/pages/expenses/Expenses"));
const Products = lazy(() => import("@/pages/inventory/Products"));
const ProductDetail = lazy(() => import("@/pages/inventory/ProductDetail"));
const Categories = lazy(() => import("@/pages/inventory/Categories"));
const Suppliers = lazy(() => import("@/pages/inventory/Suppliers"));
const StockOverview = lazy(() => import("@/pages/inventory/StockOverview"));
const PurchaseOrders = lazy(() => import("@/pages/inventory/PurchaseOrders"));
const PurchaseOrderDetail = lazy(() => import("@/pages/inventory/PurchaseOrderDetail"));
const Alerts = lazy(() => import("@/pages/inventory/Alerts"));
const Specialties = lazy(() => import("@/pages/medical/Specialties"));
const Diagnoses = lazy(() => import("@/pages/medical/Diagnoses"));
const Medications = lazy(() => import("@/pages/medical/Medications"));
const ProceduresPage = lazy(() => import("@/pages/medical/Procedures"));
const MedicalRecords = lazy(() => import("@/pages/medical/MedicalRecords"));
const QuickConsult = lazy(() => import("@/pages/medical/QuickConsult"));
const MedicalRecordEditor = lazy(() => import("@/pages/medical/MedicalRecordEditor"));
const ConsultationDashboard = lazy(() => import("@/pages/medical/ConsultationDashboard"));
const Prescriptions = lazy(() => import("@/pages/medical/Prescriptions"));
const PrescriptionDetail = lazy(() => import("@/pages/medical/PrescriptionDetail"));
const DocumentsCenter = lazy(() => import("@/pages/medical/DocumentsCenter"));
const PatientDental = lazy(() => import("@/pages/patients/PatientDental"));
const Departments = lazy(() => import("@/pages/hr/Departments"));
const Positions = lazy(() => import("@/pages/hr/Positions"));
const Staff = lazy(() => import("@/pages/hr/Staff"));
const StaffDetail = lazy(() => import("@/pages/hr/StaffDetail"));
const Schedules = lazy(() => import("@/pages/hr/Schedules"));
const Attendance = lazy(() => import("@/pages/hr/Attendance"));
const Leaves = lazy(() => import("@/pages/hr/Leaves"));
const Payroll = lazy(() => import("@/pages/hr/Payroll"));
const PendingCommissions = lazy(() => import("@/pages/hr/PendingCommissions"));
const Performance = lazy(() => import("@/pages/hr/Performance"));
const TargetBonuses = lazy(() => import("@/pages/hr/TargetBonuses"));
const Coupons = lazy(() => import("@/pages/coupons/Coupons"));
const ReportsDashboard = lazy(() => import("@/pages/reports/ReportsDashboard"));
const FinancialReports = lazy(() => import("@/pages/reports/FinancialReports"));
const OperationalReports = lazy(() => import("@/pages/reports/OperationalReports"));
const MedicalReports = lazy(() => import("@/pages/reports/MedicalReports"));
const HRReports = lazy(() => import("@/pages/reports/HRReports"));
const InventoryReports = lazy(() => import("@/pages/reports/InventoryReports"));
const ScheduledReports = lazy(() => import("@/pages/reports/ScheduledReports"));
const DoctorCommissions = lazy(() => import("@/pages/reports/DoctorCommissions"));
const DoctorPerformance = lazy(() => import("@/pages/reports/DoctorPerformance"));
const GeneralSettings = lazy(() => import("@/pages/settings/GeneralSettings"));
const AppointmentSettings = lazy(() => import("@/pages/settings/AppointmentSettings"));
const InvoiceSettings = lazy(() => import("@/pages/settings/InvoiceSettings"));
const PaymentMethodsPage = lazy(() => import("@/pages/settings/PaymentMethods"));
const ServicesPage = lazy(() => import("@/pages/settings/Services"));
const InsuranceCompanies = lazy(() => import("@/pages/settings/InsuranceCompanies"));
const InsuranceContracts = lazy(() => import("@/pages/settings/InsuranceContracts"));
const NotificationSettings = lazy(() => import("@/pages/settings/NotificationSettings"));
const RemindersSettings = lazy(() => import("@/pages/settings/RemindersSettings"));
const AutomatedCommunication = lazy(() => import("@/pages/settings/AutomatedCommunication"));
const Templates = lazy(() => import("@/pages/settings/Templates"));
const LanguagesPage = lazy(() => import("@/pages/settings/Languages"));
const RolePermissions = lazy(() => import("@/pages/settings/RolePermissions"));
const UserManagement = lazy(() => import("@/pages/settings/UserManagement"));
const BackupExport = lazy(() => import("@/pages/settings/BackupExport"));
const AuditLogs = lazy(() => import("@/pages/settings/AuditLogs"));
const SystemInfo = lazy(() => import("@/pages/settings/SystemInfo"));
const Branches = lazy(() => import("@/pages/branches/Branches"));
const BranchDashboard = lazy(() => import("@/pages/branches/BranchDashboard"));
const Reminders = lazy(() => import("@/pages/reminders/Reminders"));
const ScheduledReminders = lazy(() => import("@/pages/reminders/ScheduledReminders"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="size-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

function AppContent() {
  useEffect(() => attachGlobalRefreshListeners(), []);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/trust" element={<Trust />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/patients" element={<PermissionRoute><PatientsPage /></PermissionRoute>} />
              <Route path="/patients/:id" element={<PermissionRoute><PatientProfile /></PermissionRoute>} />
              <Route path="/calendar" element={<PermissionRoute><CalendarPage /></PermissionRoute>} />
              <Route path="/queue" element={<PermissionRoute><QueuePage /></PermissionRoute>} />
              <Route path="/queue/audit" element={<PermissionRoute><QueueAuditPage /></PermissionRoute>} />
              <Route path="/queue/self-audit" element={<PermissionRoute><QueueSelfAuditPage /></PermissionRoute>} />
              <Route path="/appointments/:appointmentId" element={<PermissionRoute><AppointmentDetailPage /></PermissionRoute>} />
              <Route path="/invoices" element={<PermissionRoute><Invoices /></PermissionRoute>} />
              <Route path="/invoices/outstanding" element={<PermissionRoute><OutstandingDebts /></PermissionRoute>} />
              <Route path="/invoices/:id" element={<PermissionRoute><InvoiceDetail /></PermissionRoute>} />
              <Route path="/payments" element={<PermissionRoute><Payments /></PermissionRoute>} />
              <Route path="/treasury" element={<PermissionRoute><Treasury /></PermissionRoute>} />
              <Route path="/treasury/daily-close" element={<PermissionRoute><TreasuryDailyClose /></PermissionRoute>} />
              <Route path="/expenses" element={<PermissionRoute><Expenses /></PermissionRoute>} />
              <Route path="/coupons" element={<PermissionRoute><Coupons /></PermissionRoute>} />
              <Route path="/reminders" element={<PermissionRoute><Reminders /></PermissionRoute>} />
              <Route path="/reminders/scheduled" element={<PermissionRoute><Reminders /></PermissionRoute>}>
                <Route index element={<ScheduledReminders />} />
              </Route>
              <Route path="/inventory" element={<PermissionRoute><StockOverview /></PermissionRoute>} />
              <Route path="/inventory/stock" element={<PermissionRoute><StockOverview /></PermissionRoute>} />
              <Route path="/inventory/products" element={<PermissionRoute><Products /></PermissionRoute>} />
              <Route path="/inventory/products/:id" element={<PermissionRoute><ProductDetail /></PermissionRoute>} />
              <Route path="/inventory/categories" element={<PermissionRoute><Categories /></PermissionRoute>} />
              <Route path="/inventory/suppliers" element={<PermissionRoute><Suppliers /></PermissionRoute>} />
              <Route path="/inventory/purchase-orders" element={<PermissionRoute><PurchaseOrders /></PermissionRoute>} />
              <Route path="/inventory/purchase-orders/:id" element={<PermissionRoute><PurchaseOrderDetail /></PermissionRoute>} />
              <Route path="/inventory/alerts" element={<PermissionRoute><Alerts /></PermissionRoute>} />
              <Route path="/medical/records" element={<PermissionRoute><MedicalRecords /></PermissionRoute>} />
              <Route path="/medical/records/:id" element={<PermissionRoute><MedicalRecordEditor /></PermissionRoute>} />
              <Route path="/medical/consultation/:recordId" element={<PermissionRoute><ConsultationDashboard /></PermissionRoute>} />
              <Route path="/medical/quick-consult" element={<PermissionRoute><QuickConsult /></PermissionRoute>} />
              <Route path="/medical/prescriptions" element={<PermissionRoute><Prescriptions /></PermissionRoute>} />
              <Route path="/medical/prescriptions/:id" element={<PermissionRoute><PrescriptionDetail /></PermissionRoute>} />
              <Route path="/medical/documents" element={<PermissionRoute><DocumentsCenter /></PermissionRoute>} />
              <Route path="/patients/:id/dental" element={<PermissionRoute><PatientDental /></PermissionRoute>} />
              <Route path="/medical/specialties" element={<PermissionRoute><Specialties /></PermissionRoute>} />
              <Route path="/medical/diagnoses" element={<PermissionRoute><Diagnoses /></PermissionRoute>} />
              <Route path="/medical/medications" element={<PermissionRoute><Medications /></PermissionRoute>} />
              <Route path="/medical/procedures" element={<PermissionRoute><ProceduresPage /></PermissionRoute>} />
              <Route path="/hr/departments" element={<PermissionRoute><Departments /></PermissionRoute>} />
              <Route path="/hr/positions" element={<PermissionRoute><Positions /></PermissionRoute>} />
              <Route path="/hr/staff" element={<PermissionRoute><Staff /></PermissionRoute>} />
              <Route path="/hr/staff/:id" element={<PermissionRoute><StaffDetail /></PermissionRoute>} />
              <Route path="/hr/schedules" element={<PermissionRoute><Schedules /></PermissionRoute>} />
              <Route path="/hr/attendance" element={<PermissionRoute><Attendance /></PermissionRoute>} />
              <Route path="/hr/leaves" element={<PermissionRoute><Leaves /></PermissionRoute>} />
              <Route path="/hr/payroll" element={<PermissionRoute><Payroll /></PermissionRoute>} />
              <Route path="/hr/pending-commissions" element={<PermissionRoute><PendingCommissions /></PermissionRoute>} />
              <Route path="/hr/performance" element={<PermissionRoute><Performance /></PermissionRoute>} />
              <Route path="/hr/target-bonuses" element={<PermissionRoute><TargetBonuses /></PermissionRoute>} />
              <Route path="/reports" element={<PermissionRoute><ReportsDashboard /></PermissionRoute>} />
              <Route path="/reports/financial" element={<PermissionRoute><FinancialReports /></PermissionRoute>} />
              <Route path="/reports/operational" element={<PermissionRoute><OperationalReports /></PermissionRoute>} />
              <Route path="/reports/medical" element={<PermissionRoute><MedicalReports /></PermissionRoute>} />
              <Route path="/reports/hr" element={<PermissionRoute><HRReports /></PermissionRoute>} />
              <Route path="/reports/inventory" element={<PermissionRoute><InventoryReports /></PermissionRoute>} />
              <Route path="/reports/scheduled" element={<PermissionRoute><ScheduledReports /></PermissionRoute>} />
              <Route path="/reports/commissions" element={<PermissionRoute><DoctorCommissions /></PermissionRoute>} />
              <Route path="/reports/doctor-performance" element={<PermissionRoute><DoctorPerformance /></PermissionRoute>} />
              <Route path="/branches" element={<PermissionRoute><Branches /></PermissionRoute>} />
              <Route path="/branches/dashboard" element={<PermissionRoute><BranchDashboard /></PermissionRoute>} />
              <Route path="/settings/branches" element={<PermissionRoute><Branches /></PermissionRoute>} />
              <Route path="/settings" element={<PermissionRoute><GeneralSettings /></PermissionRoute>} />
              <Route path="/settings/general" element={<PermissionRoute><GeneralSettings /></PermissionRoute>} />
              <Route path="/settings/appointments" element={<PermissionRoute><AppointmentSettings /></PermissionRoute>} />
              <Route path="/settings/invoices" element={<PermissionRoute><InvoiceSettings /></PermissionRoute>} />
              <Route path="/settings/payments" element={<PermissionRoute><PaymentMethodsPage /></PermissionRoute>} />
              <Route path="/settings/services" element={<PermissionRoute><ServicesPage /></PermissionRoute>} />
              <Route path="/settings/insurance" element={<PermissionRoute><InsuranceCompanies /></PermissionRoute>} />
              <Route path="/settings/insurance-contracts" element={<PermissionRoute><InsuranceContracts /></PermissionRoute>} />
              <Route path="/settings/notifications" element={<PermissionRoute><NotificationSettings /></PermissionRoute>} />
              <Route path="/settings/reminders" element={<PermissionRoute><RemindersSettings /></PermissionRoute>} />
              <Route path="/settings/automated-comm" element={<PermissionRoute><AutomatedCommunication /></PermissionRoute>} />
              <Route path="/settings/templates/email" element={<PermissionRoute><Templates kind="email" /></PermissionRoute>} />
              <Route path="/settings/templates/sms" element={<PermissionRoute><Templates kind="sms" /></PermissionRoute>} />
              <Route path="/settings/templates/whatsapp" element={<PermissionRoute><Templates kind="whatsapp" /></PermissionRoute>} />
              <Route path="/settings/languages" element={<PermissionRoute><LanguagesPage /></PermissionRoute>} />
              <Route path="/settings/roles" element={<PermissionRoute><RolePermissions /></PermissionRoute>} />
              <Route path="/settings/users" element={<PermissionRoute><UserManagement /></PermissionRoute>} />
              <Route path="/settings/backup" element={<PermissionRoute><BackupExport /></PermissionRoute>} />
              <Route path="/settings/audit" element={<PermissionRoute><AuditLogs /></PermissionRoute>} />
              <Route path="/settings/system" element={<PermissionRoute><SystemInfo /></PermissionRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <BranchProvider>
            <AppContent />
          </BranchProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;