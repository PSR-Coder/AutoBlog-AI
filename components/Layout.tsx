import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, PlusCircle, Activity, Box } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <Box className="w-8 h-8 text-indigo-400" />
            <span className="text-xl font-bold tracking-tight">AutoBlog AI</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">v1.0.4 Enterprise</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink 
            to="/create" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }
          >
            <PlusCircle size={20} />
            <span>New Campaign</span>
          </NavLink>

          <NavLink 
            to="/settings" 
            className={({ isActive }) => 
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }
          >
            <Settings size={20} />
            <span>Global Settings</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center space-x-3 px-4 py-2 text-slate-400 text-sm">
            <Activity size={16} />
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