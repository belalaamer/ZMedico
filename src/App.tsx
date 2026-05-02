import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { I18nProvider } from "@/contexts/I18nContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/layout/AppShell";
import AuthPage from "@/pages/auth/Auth";
import ResetPassword from "@/pages/auth/ResetPassword";
import Dashboard from "@/pages/dashboard/Dashboard";
import PatientsPage from "@/pages/patients/Patients";
import PatientProfile from "@/pages/patients/PatientProfile";
import CalendarPage from "@/pages/calendar/CalendarPage";
import Placeholder from "@/pages/Placeholder";
import Invoices from "@/pages/invoices/Invoices";
import InvoiceDetail from "@/pages/invoices/InvoiceDetail";
import Payments from "@/pages/payments/Payments";
import Treasury from "@/pages/treasury/Treasury";
import Expenses from "@/pages/expenses/Expenses";
import Products from "@/pages/inventory/Products";
import ProductDetail from "@/pages/inventory/ProductDetail";
import Categories from "@/pages/inventory/Categories";
import Suppliers from "@/pages/inventory/Suppliers";
import StockOverview from "@/pages/inventory/StockOverview";
import PurchaseOrders from "@/pages/inventory/PurchaseOrders";
import PurchaseOrderDetail from "@/pages/inventory/PurchaseOrderDetail";
import Alerts from "@/pages/inventory/Alerts";
import Specialties from "@/pages/medical/Specialties";
import Diagnoses from "@/pages/medical/Diagnoses";
import Medications from "@/pages/medical/Medications";
import ProceduresPage from "@/pages/medical/Procedures";
import MedicalRecords from "@/pages/medical/MedicalRecords";
import QuickConsult from "@/pages/medical/QuickConsult";
import MedicalRecordEditor from "@/pages/medical/MedicalRecordEditor";
import Prescriptions from "@/pages/medical/Prescriptions";
import PrescriptionDetail from "@/pages/medical/PrescriptionDetail";
import DocumentsCenter from "@/pages/medical/DocumentsCenter";
import PatientDental from "@/pages/patients/PatientDental";
import Departments from "@/pages/hr/Departments";
import Positions from "@/pages/hr/Positions";
import Staff from "@/pages/hr/Staff";
import StaffDetail from "@/pages/hr/StaffDetail";
import Schedules from "@/pages/hr/Schedules";
import Attendance from "@/pages/hr/Attendance";
import Leaves from "@/pages/hr/Leaves";
import Payroll from "@/pages/hr/Payroll";
import Performance from "@/pages/hr/Performance";
import ReportsDashboard from "@/pages/reports/ReportsDashboard";
import FinancialReports from "@/pages/reports/FinancialReports";
import OperationalReports from "@/pages/reports/OperationalReports";
import MedicalReports from "@/pages/reports/MedicalReports";
import HRReports from "@/pages/reports/HRReports";
import InventoryReports from "@/pages/reports/InventoryReports";
import ScheduledReports from "@/pages/reports/ScheduledReports";
import GeneralSettings from "@/pages/settings/GeneralSettings";
import AppointmentSettings from "@/pages/settings/AppointmentSettings";
import InvoiceSettings from "@/pages/settings/InvoiceSettings";
import PaymentMethodsPage from "@/pages/settings/PaymentMethods";
import ServicesPage from "@/pages/settings/Services";
import NotificationSettings from "@/pages/settings/NotificationSettings";
import Templates from "@/pages/settings/Templates";
import LanguagesPage from "@/pages/settings/Languages";
import RolePermissions from "@/pages/settings/RolePermissions";
import UserManagement from "@/pages/settings/UserManagement";
import BackupExport from "@/pages/settings/BackupExport";
import AuditLogs from "@/pages/settings/AuditLogs";
import SystemInfo from "@/pages/settings/SystemInfo";
import Branches from "@/pages/branches/Branches";
import Reminders from "@/pages/reminders/Reminders";
import ScheduledReminders from "@/pages/reminders/ScheduledReminders";
import { attachGlobalRefreshListeners } from "@/lib/dataSync";

const queryClient = new QueryClient();

// Attach focus/visibility listeners that broadcast a global "*" sync event.
attachGlobalRefreshListeners();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <BranchProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/patients" element={<PatientsPage />} />
                  <Route path="/patients/:id" element={<PatientProfile />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/invoices/:id" element={<InvoiceDetail />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/treasury" element={<Treasury />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/reminders" element={<Reminders />} />
                  <Route path="/reminders/scheduled" element={<Reminders />}>
                    <Route index element={<ScheduledReminders />} />
                  </Route>
                  <Route path="/inventory" element={<StockOverview />} />
                  <Route path="/inventory/stock" element={<StockOverview />} />
                  <Route path="/inventory/products" element={<Products />} />
                  <Route path="/inventory/products/:id" element={<ProductDetail />} />
                  <Route path="/inventory/categories" element={<Categories />} />
                  <Route path="/inventory/suppliers" element={<Suppliers />} />
                  <Route path="/inventory/purchase-orders" element={<PurchaseOrders />} />
                  <Route path="/inventory/purchase-orders/:id" element={<PurchaseOrderDetail />} />
                  <Route path="/inventory/alerts" element={<Alerts />} />
                  <Route path="/medical/records" element={<MedicalRecords />} />
                  <Route path="/medical/records/:id" element={<MedicalRecordEditor />} />
                  <Route path="/medical/quick-consult" element={<QuickConsult />} />
                  <Route path="/medical/prescriptions" element={<Prescriptions />} />
                  <Route path="/medical/prescriptions/:id" element={<PrescriptionDetail />} />
                  <Route path="/medical/documents" element={<DocumentsCenter />} />
                  <Route path="/patients/:id/dental" element={<PatientDental />} />
                  <Route path="/medical/specialties" element={<Specialties />} />
                  <Route path="/medical/diagnoses" element={<Diagnoses />} />
                  <Route path="/medical/medications" element={<Medications />} />
                  <Route path="/medical/procedures" element={<ProceduresPage />} />
                  <Route path="/hr/departments" element={<Departments />} />
                  <Route path="/hr/positions" element={<Positions />} />
                  <Route path="/hr/staff" element={<Staff />} />
                  <Route path="/hr/staff/:id" element={<StaffDetail />} />
                  <Route path="/hr/schedules" element={<Schedules />} />
                  <Route path="/hr/attendance" element={<Attendance />} />
                  <Route path="/hr/leaves" element={<Leaves />} />
                  <Route path="/hr/payroll" element={<Payroll />} />
                  <Route path="/hr/performance" element={<Performance />} />
                  <Route path="/reports" element={<ReportsDashboard />} />
                  <Route path="/reports/financial" element={<FinancialReports />} />
                  <Route path="/reports/operational" element={<OperationalReports />} />
                  <Route path="/reports/medical" element={<MedicalReports />} />
                  <Route path="/reports/hr" element={<HRReports />} />
                  <Route path="/reports/inventory" element={<InventoryReports />} />
                  <Route path="/reports/scheduled" element={<ScheduledReports />} />
                  <Route path="/branches" element={<Branches />} />
                  <Route path="/settings/branches" element={<Branches />} />
                  <Route path="/settings" element={<GeneralSettings />} />
                  <Route path="/settings/general" element={<GeneralSettings />} />
                  <Route path="/settings/appointments" element={<AppointmentSettings />} />
                  <Route path="/settings/invoices" element={<InvoiceSettings />} />
                  <Route path="/settings/payments" element={<PaymentMethodsPage />} />
                  <Route path="/settings/services" element={<ServicesPage />} />
                  <Route path="/settings/notifications" element={<NotificationSettings />} />
                  <Route path="/settings/templates/email" element={<Templates kind="email" />} />
                  <Route path="/settings/templates/sms" element={<Templates kind="sms" />} />
                  <Route path="/settings/templates/whatsapp" element={<Templates kind="whatsapp" />} />
                  <Route path="/settings/languages" element={<LanguagesPage />} />
                  <Route path="/settings/roles" element={<RolePermissions />} />
                  <Route path="/settings/users" element={<UserManagement />} />
                  <Route path="/settings/backup" element={<BackupExport />} />
                  <Route path="/settings/audit" element={<AuditLogs />} />
                  <Route path="/settings/system" element={<SystemInfo />} />
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BranchProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
