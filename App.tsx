import React, { useState, useCallback, createContext, useContext, useMemo, useEffect } from 'react';
import Navbar from './components/Navbar';
import ComposingAssistant from './components/ComposingAssistant';
import ChordFinder from './components/ChordFinder';
import { View } from './types';

// --- Theme Context ---
type Theme = 'light' | 'dark';
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === 'dark';
    
    root.classList.remove(isDark ? 'light' : 'dark');
    root.classList.add(theme);

    if (isDark) {
        document.body.className = 'bg-slate-900 text-gray-200';
    } else {
        document.body.className = 'bg-gray-100 text-gray-800';
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
// --- End Theme Context ---

const AppContent: React.FC = () => {
  const [activeView, setActiveView] = useState<View>(View.COMPOSING_ASSISTANT);

  const handleNavigate = useCallback((view: View) => {
    setActiveView(view);
  }, []);

  return (
    <div className="min-h-screen font-sans transition-colors duration-300">
      <Navbar activeView={activeView} onNavigate={handleNavigate} />
      <main className="p-4 sm:p-6 md:p-8">
        {activeView === View.COMPOSING_ASSISTANT && <ComposingAssistant />}
        {activeView === View.CHORD_FINDER && <ChordFinder />}
      </main>
    </div>
  );
};


const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;