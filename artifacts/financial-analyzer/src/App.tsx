import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Dashboard from "./pages/dashboard";
import WorkingCapital from "./pages/working-capital";
import BankingAnalysis from "./pages/banking-analysis";
import GstItr from "./pages/gst-itr";
import MultiYear from "./pages/multi-year";
import Storage from "./pages/storage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/working-capital" component={WorkingCapital} />
      <Route path="/banking-analysis" component={BankingAnalysis} />
      <Route path="/gst-itr" component={GstItr} />
      <Route path="/multi-year" component={MultiYear} />
      <Route path="/storage" component={Storage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
