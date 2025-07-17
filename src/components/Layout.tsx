import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Download, Settings, ChevronRight } from 'lucide-react';

const Layout: React.FC = () => {
  return (
    <div className="bg-[#0A0A0C] text-white min-h-screen font-sans flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

const Sidebar: React.FC = () => {
  const navLinkClasses = "flex items-center w-full px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 relative group";
  const activeLinkClasses = "bg-blue-600/10 text-blue-400 hover:bg-blue-600/20";

  return (
    <aside className="w-[280px] bg-[#111114] border-r border-white/5 py-6 px-3 flex flex-col">
      <div className="px-4 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-blue-600/20 p-2 rounded-lg">
            <Download size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Yeyo Downloader</h1>
            <p className="text-xs text-gray-500">Version 1.0.0</p>
          </div>
        </div>
      </div>

      <div className="px-4 mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Menu</h2>
        <nav className="space-y-1">
          <NavLink 
            to="/" 
            className={({ isActive }) => `${navLinkClasses} ${isActive ? activeLinkClasses : ''}`}
          >
            <div className="flex items-center gap-3 flex-1">
              <Download size={18} />
              <span className="font-medium">Downloader</span>
            </div>
            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </NavLink>
          <NavLink 
            to="/settings" 
            className={({ isActive }) => `${navLinkClasses} ${isActive ? activeLinkClasses : ''}`}
          >
            <div className="flex items-center gap-3 flex-1">
              <Settings size={18} />
              <span className="font-medium">Settings</span>
            </div>
            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </NavLink>
        </nav>
      </div>

      <div className="mt-auto px-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-white/5">
          <h3 className="text-sm font-medium text-white mb-1">Need Help?</h3>
          <p className="text-xs text-gray-400 mb-3">Check out our documentation for help and examples</p>
          <a 
            href="https://github.com/your-repo" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Documentation →
          </a>
        </div>
      </div>
    </aside>
  );
}

export default Layout; 