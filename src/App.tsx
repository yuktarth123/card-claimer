import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Admin from "./pages/Admin.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import Slabs from "./pages/Slabs.tsx";
import BoxBreaks from "./pages/BoxBreaks.tsx";
import LiveBreak from "./pages/LiveBreak.tsx";
import LiveBreakChat from "./pages/LiveBreakChat.tsx";
import { AnalyticsTracker } from "./components/AnalyticsTracker.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AnalyticsTracker />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/slabs" element={<Slabs />} />
          <Route path="/breaks" element={<BoxBreaks />} />
          <Route path="/breaks/:breakId" element={<LiveBreak />} />
          <Route path="/breaks/:breakId/chat" element={<LiveBreakChat />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;