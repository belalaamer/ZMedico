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
                  <Route path="/inventory" element={<Placeholder titleKey="inventory" />} />
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
