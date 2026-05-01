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

const queryClient = new QueryClient();

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
                  <Route path="/reminders" element={<Placeholder titleKey="reminders" />} />
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
                  <Route path="/branches" element={<Placeholder titleKey="branches" />} />
                  <Route path="/settings" element={<Placeholder titleKey="settings" />} />
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
