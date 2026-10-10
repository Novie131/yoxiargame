import { Navigate, Route, Routes } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { AgentActivityScreen } from '@/screens/AgentActivityScreen'
import { AgentInterestsScreen } from '@/screens/AgentInterestsScreen'
import { CommuteSetupScreen } from '@/screens/CommuteSetupScreen'
import { DevIndexScreen } from '@/screens/DevIndexScreen'
import { ExploreScreen } from '@/screens/ExploreScreen'
import { PlanPreviewScreen } from '@/screens/explore/PlanPreviewScreen'
import { PlanScreen } from '@/screens/explore/PlanScreen'
import { MemberScreen } from '@/screens/MemberScreen'
import { NotificationsScreen } from '@/screens/NotificationsScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { DelayRescueScreen } from '@/screens/DelayRescueScreen'
import { LockScreenScreen } from '@/screens/LockScreenScreen'
import { BookingScreen } from '@/screens/ride/BookingScreen'
import { DriverArrivingScreen } from '@/screens/ride/DriverArrivingScreen'
import { EstimateScreen } from '@/screens/ride/EstimateScreen'
import { SettlementScreen } from '@/screens/ride/SettlementScreen'
import { TripInProgressScreen } from '@/screens/ride/TripInProgressScreen'
import { RainyCommuteScreen } from '@/screens/RainyCommuteScreen'
import { IgRouteDetailScreen } from '@/screens/IgRouteDetailScreen'
import { RainyCommutePlanScreen } from '@/screens/rainy/RainyCommutePlanScreen'
import { RainyHourlyWeatherScreen } from '@/screens/rainy/RainyHourlyWeatherScreen'
import { RainyMetroRouteScreen } from '@/screens/rainy/RainyMetroRouteScreen'
import { RainyRideConfirmScreen } from '@/screens/rainy/RainyRideConfirmScreen'
import { UvAlertScreen } from '@/screens/UvAlertScreen'
import { TripsScreen } from '@/screens/TripsScreen'

export default function App() {
  return (
    <Routes>
      {/*
        * 鎖定畫面推播的示範頁掛在手機殼外面：鎖定畫面不該有 App 的狀態列與 tab bar。
        * 用 lib/layout 的「沒有 tab bar 的路徑」也只能拿掉 tab bar，假狀態列仍在。
        */}
      <Route path="/lockscreen" element={<LockScreenScreen />} />
      <Route path="*" element={<ShellRoutes />} />
    </Routes>
  )
}

function ShellRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<AgentActivityScreen />} />
        <Route path="/interests" element={<AgentInterestsScreen />} />
        <Route path="/commute-setup" element={<CommuteSetupScreen />} />
        <Route path="/rainy" element={<RainyCommuteScreen />} />
        <Route path="/rainy/commute" element={<RainyCommutePlanScreen />} />
        <Route path="/rainy/ride" element={<RainyRideConfirmScreen />} />
        <Route path="/rainy/metro" element={<RainyMetroRouteScreen />} />
        <Route path="/rainy/weather" element={<RainyHourlyWeatherScreen />} />
        <Route path="/explore/ig-route" element={<IgRouteDetailScreen />} />
        <Route path="/uv" element={<UvAlertScreen />} />
        <Route path="/rescue" element={<DelayRescueScreen />} />
        <Route path="/trips" element={<TripsScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/explore/plan" element={<PlanScreen />} />
        <Route path="/explore/plan/preview" element={<PlanPreviewScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/member" element={<MemberScreen />} />
        <Route path="/ride/booking" element={<BookingScreen />} />
        <Route path="/ride/estimate" element={<EstimateScreen />} />
        <Route path="/ride/driver" element={<DriverArrivingScreen />} />
        <Route path="/ride/trip" element={<TripInProgressScreen />} />
        <Route path="/ride/settlement" element={<SettlementScreen />} />
        <Route path="/dev" element={<DevIndexScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
