import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, PlusCircle, Activity, Box, Moon, Sun } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    if (localStorage.getItem('theme') === 'dark') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 dark:bg-slate-950 text-white flex flex-col fixed h-full z-10 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Box className="w-8 h-8 text-indigo-400" />
            <span className="text-xl font-bold tracking-tight text-white">AutoBlog AI</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">v1.0.5 Enterprise</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink 
            to="/create" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <PlusCircle size={20} />
            <span>New Campaign</span>
          </NavLink>

          <NavLink 
            to="/settings" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings size={20} />
            <span>Global Settings</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center justify-between w-full px-4 py-2 bg-slate-800 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center">
              {darkMode ? <Moon size={16} className="mr-2 text-indigo-400"/> : <Sun size={16} className="mr-2 text-yellow-400"/>}
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          </button>

          <div className="flex items-center space-x-3 px-4 py-2 text-slate-500 text-xs">
            <Activity size={14} className="text-green-500" />
            <span>System Status: Optimal</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;