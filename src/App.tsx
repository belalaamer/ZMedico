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
import { PermissionRoute } from "@/components/PermissionRoute";
import AppShell from "@/components/layout/AppShell";
import AuthPage from "@/pages/auth/Auth";
import ResetPassword from "@/pages/auth/ResetPassword";
import Pricing from "@/pages/pricing/Pricing";
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
import DoctorCommissions from "@/pages/reports/DoctorCommissions";
import GeneralSettings from "@/pages/settings/GeneralSettings";
import AppointmentSettings from "@/pages/settings/AppointmentSettings";
import InvoiceSettings from "@/pages/settings/InvoiceSettings";
import PaymentMethodsPage from "@/pages/settings/PaymentMethods";
import ServicesPage from "@/pages/settings/Services";
import InsuranceCompanies from "@/pages/settings/InsuranceCompanies";
import NotificationSettings from "@/pages/settings/NotificationSettings";
import RemindersSettings from "@/pages/settings/RemindersSettings";
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
                <Route path="/pricing" element={<Pricing />} />
                <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/patients" element={<PermissionRoute><PatientsPage /></PermissionRoute>} />
                  <Route path="/patients/:id" element={<PermissionRoute><PatientProfile /></PermissionRoute>} />
                  <Route path="/calendar" element={<PermissionRoute><CalendarPage /></PermissionRoute>} />
                  <Route path="/invoices" element={<PermissionRoute><Invoices /></PermissionRoute>} />
                  <Route path="/invoices/:id" element={<PermissionRoute><InvoiceDetail /></PermissionRoute>} />
                  <Route path="/payments" element={<PermissionRoute><Payments /></PermissionRoute>} />
                  <Route path="/treasury" element={<PermissionRoute><Treasury /></PermissionRoute>} />
                  <Route path="/expenses" element={<PermissionRoute><Expenses /></PermissionRoute>} />
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
                  <Route path="/hr/performance" element={<PermissionRoute><Performance /></PermissionRoute>} />
                  <Route path="/reports" element={<PermissionRoute><ReportsDashboard /></PermissionRoute>} />
                  <Route path="/reports/financial" element={<PermissionRoute><FinancialReports /></PermissionRoute>} />
                  <Route path="/reports/operational" element={<PermissionRoute><OperationalReports /></PermissionRoute>} />
                  <Route path="/reports/medical" element={<PermissionRoute><MedicalReports /></PermissionRoute>} />
                  <Route path="/reports/hr" element={<PermissionRoute><HRReports /></PermissionRoute>} />
                  <Route path="/reports/inventory" element={<PermissionRoute><InventoryReports /></PermissionRoute>} />
                  <Route path="/reports/scheduled" element={<PermissionRoute><ScheduledReports /></PermissionRoute>} />
                  <Route path="/reports/commissions" element={<PermissionRoute><DoctorCommissions /></PermissionRoute>} />
                  <Route path="/branches" element={<PermissionRoute><Branches /></PermissionRoute>} />
                  <Route path="/settings/branches" element={<PermissionRoute><Branches /></PermissionRoute>} />
                  <Route path="/settings" element={<PermissionRoute><GeneralSettings /></PermissionRoute>} />
                  <Route path="/settings/general" element={<PermissionRoute><GeneralSettings /></PermissionRoute>} />
                  <Route path="/settings/appointments" element={<PermissionRoute><AppointmentSettings /></PermissionRoute>} />
                  <Route path="/settings/invoices" element={<PermissionRoute><InvoiceSettings /></PermissionRoute>} />
                  <Route path="/settings/payments" element={<PermissionRoute><PaymentMethodsPage /></PermissionRoute>} />
                  <Route path="/settings/services" element={<PermissionRoute><ServicesPage /></PermissionRoute>} />
                  <Route path="/settings/insurance" element={<PermissionRoute><InsuranceCompanies /></PermissionRoute>} />
                  <Route path="/settings/notifications" element={<PermissionRoute><NotificationSettings /></PermissionRoute>} />
                  <Route path="/settings/reminders" element={<PermissionRoute><RemindersSettings /></PermissionRoute>} />
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
