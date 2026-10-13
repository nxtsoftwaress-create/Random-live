import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppLayout } from "../layouts/AppLayout";
import { useAuthStore } from "../store/auth.store";
import { useSettingsStore } from "../store/settings.store";
import { useRoomStore } from "../store/room.store";
import Landing from "../pages/Landing";
import SafetyGate from "../pages/SafetyGate";
import GuestEntry from "../pages/GuestEntry";
import Permissions from "../pages/Permissions";
import Preferences from "../pages/Preferences";
import Matchmaking from "../pages/Matchmaking";
import LiveRoom from "../pages/LiveRoom";

type Requirement = "agreed" | "auth" | "prefs" | "live";

function Guard({ require, children }: { require: Requirement; children: ReactNode }) {
  const agreedToTerms = useAuthStore((s) => s.agreedToTerms);
  const hasAuth = useAuthStore((s) => !!s.accessToken && !!s.user);
  const prefsChosen = useSettingsStore((s) => s.prefsChosen);
  const roomId = useRoomStore((s) => s.roomId);

  if (require === "agreed" && !agreedToTerms) return <Navigate to="/safety" replace />;
  if (require === "auth" && !hasAuth)
    return <Navigate to={agreedToTerms ? "/guest" : "/safety"} replace />;
  if (require === "prefs" && !prefsChosen) return <Navigate to="/preferences" replace />;
  if (require === "live" && !roomId) return <Navigate to="/matchmaking" replace />;
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/safety" element={<SafetyGate />} />
        <Route
          path="/guest"
          element={
            <Guard require="agreed">
              <GuestEntry />
            </Guard>
          }
        />
        <Route
          path="/permissions"
          element={
            <Guard require="auth">
              <Permissions />
            </Guard>
          }
        />
        <Route
          path="/preferences"
          element={
            <Guard require="auth">
              <Preferences />
            </Guard>
          }
        />
        <Route
          path="/matchmaking"
          element={
            <Guard require="prefs">
              <Matchmaking />
            </Guard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* Live room is full-screen — outside the page layout. */}
      <Route
        path="/live"
        element={
          <Guard require="live">
            <LiveRoom />
          </Guard>
        }
      />
    </Routes>
  );
}
