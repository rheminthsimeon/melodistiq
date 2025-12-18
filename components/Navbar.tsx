import React from 'react';
import { View } from '../types';
import { useTheme } from '../App';

const NavItem: React.FC<{
  view: View;
  activeView: View;
  onClick: (view: View) => void;
  children: React.ReactNode;
}> = ({ view, activeView, onClick, children }) => {
  const isActive = activeView === view;
  return (
    <button
      onClick={() => onClick(view)}
      className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-cyan-500 text-white shadow-lg'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
};

const SunIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const MoonIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
);

interface NavbarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-md sticky top-0 z-40 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
             <h1 className="text-xl font-bold text-slate-800 dark:text-white">Melodistiq</h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <NavItem view={View.COMPOSING_ASSISTANT} activeView={activeView} onClick={onNavigate}>
              Composing Assistant
            </NavItem>
            <NavItem view={View.CHORD_FINDER} activeView={activeView} onClick={onNavigate}>
              Chord Finder
            </NavItem>
            <button
                onClick={toggleTheme}
                className="p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="Toggle theme"
            >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
