import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ProtectedRoute from '@/components/ProtectedRoute';
import TabNavigationProvider from '@/components/TabNavigationProvider';
import { Navigate } from 'react-router-dom';
// Add page imports here
import Home from '@/pages/Home';
import States from '@/pages/States';
import StateTours from '@/pages/StateTours';
import TourDetail from '@/pages/TourDetail';
import StopDetail from '@/pages/StopDetail';
import Evidence from '@/pages/Evidence';
import Favorites from '@/pages/Favorites';
import Profile from '@/pages/Profile';
import Toolkit from '@/pages/Toolkit';
import Nearby from '@/pages/Nearby';
import AbroadTours from '@/pages/AbroadTours';
import Settings from '@/pages/Settings';
import Admin from '@/pages/Admin';
import Store from '@/pages/Store';
import StoreCategory from '@/pages/StoreCategory';
import StoreLayout from '@/components/store/StoreLayout';
import Leaderboard from '@/pages/Leaderboard';
import CommunityMap from '@/pages/CommunityMap';
import EvidenceDashboard from '@/pages/EvidenceDashboard';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <TabNavigationProvider>
    <AnimatePresence mode="wait">
    <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
    <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {/* Add your page Route elements here */}
        <Route path="/" element={<Home />} />
        <Route path="/states" element={<States />} />
        <Route path="/states/:stateAbbr" element={<StateTours />} />
        <Route path="/tour/:tourId" element={<TourDetail />} />
        <Route path="/stop/:stopId" element={<StopDetail />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route path="/evidence/new" element={<Evidence />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/toolkit" element={<Toolkit />} />
        <Route path="/nearby" element={<Nearby />} />
        <Route path="/abroad" element={<AbroadTours />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        <Route element={<StoreLayout />}>
          <Route path="/store" element={<Store />} />
          <Route path="/store/devices" element={<StoreCategory category="equipment" />} />
          <Route path="/store/apparel" element={<StoreCategory category="apparel" />} />
          <Route path="/store/other" element={<StoreCategory category="other" />} />
        </Route>
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/community-map" element={<CommunityMap />} />
        <Route path="/evidence-dashboard" element={<EvidenceDashboard />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </motion.div>
    </AnimatePresence>
    </TabNavigationProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App