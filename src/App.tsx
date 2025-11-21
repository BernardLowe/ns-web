import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ConsoleLayout } from './pages/ConsoleLayout';
import { HomePage } from './pages/HomePage';
import { RecordsPage } from './pages/RecordsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/console" element={<ConsoleLayout />}>
          <Route path="home" element={<HomePage />} />
          <Route path="name/:domainName" element={<RecordsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
