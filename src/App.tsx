import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '@/components/shell/AppShell'
import Home from '@/pages/Home'
import Waves from '@/pages/Waves'
import CrossTabs from '@/pages/CrossTabs'
import AskAI from '@/pages/AskAI'
import Weights from '@/pages/Weights'
import Storyboards from '@/pages/Storyboards'
import Groupings from '@/pages/Groupings'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
          <Route path="/waves" element={<Waves />} />
          <Route path="/cross-tabs" element={<CrossTabs />} />
          <Route path="/ask" element={<AskAI />} />
          <Route path="/weights" element={<Weights />} />
          <Route path="/storyboards" element={<Storyboards />} />
          <Route path="/groupings" element={<Groupings />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
