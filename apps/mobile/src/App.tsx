import { Navigate, Route, Routes } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { AgentActivityScreen } from '@/screens/AgentActivityScreen'
import { AgentInterestsScreen } from '@/screens/AgentInterestsScreen'
import { CommuteSetupScreen } from '@/screens/CommuteSetupScreen'
import { DevIndexScreen } from '@/screens/DevIndexScreen'
import { ExploreScreen } from '@/screens/ExploreScreen'
import { Placeholder } from '@/screens/Placeholder'
import { BookingScreen } from '@/screens/ride/BookingScreen'
import { DriverArrivingScreen } from '@/screens/ride/DriverArrivingScreen'
import { EstimateScreen } from '@/screens/ride/EstimateScreen'
import { TripInProgressScreen } from '@/screens/ride/TripInProgressScreen'
import { RainyCommuteScreen } from '@/screens/RainyCommuteScreen'
import { UvAlertScreen } from '@/screens/UvAlertScreen'
import { TripsScreen } from '@/screens/TripsScreen'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<AgentActivityScreen />} />
        <Route path="/interests" element={<AgentInterestsScreen />} />
        <Route path="/commute-setup" element={<CommuteSetupScreen />} />
        <Route path="/rainy" element={<RainyCommuteScreen />} />
        <Route path="/uv" element={<UvAlertScreen />} />
        <Route path="/trips" element={<TripsScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/settings" element={<Placeholder title="設定" figmaFrame="—" />} />
        <Route path="/member" element={<Placeholder title="會員" figmaFrame="—" />} />
        <Route path="/ride/booking" element={<BookingScreen />} />
        <Route path="/ride/estimate" element={<EstimateScreen />} />
        <Route path="/ride/driver" element={<DriverArrivingScreen />} />
        <Route path="/ride/trip" element={<TripInProgressScreen />} />
        <Route path="/dev" element={<DevIndexScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
