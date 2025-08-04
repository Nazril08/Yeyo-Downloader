import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface StatusItem {
  id: number;
  title: string;
  status: 'downloading' | 'success' | 'error';
  message: string;
}

interface DownloadPayload {
  status: string;
  message: string;
}

interface DownloadContextType {
  statuses: StatusItem[];
  setStatuses: React.Dispatch<React.SetStateAction<StatusItem[]>>;
  isDownloading: boolean;
  setIsDownloading: React.Dispatch<React.SetStateAction<boolean>>;
  addStatus: (status: Omit<StatusItem, 'id'>) => void;
  clearStatuses: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const useDownload = () => {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
};

interface DownloadProviderProps {
  children: ReactNode;
}

export const DownloadProvider: React.FC<DownloadProviderProps> = ({ children }) => {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const addStatus = (status: Omit<StatusItem, 'id'>) => {
    const newStatus: StatusItem = {
      id: Date.now(),
      ...status,
    };
    setStatuses(prev => [newStatus, ...prev]);
  };

  const clearStatuses = () => {
    setStatuses([]);
  };

  // Listen for download status updates
  useEffect(() => {
    const unlisten = listen<DownloadPayload>('DOWNLOAD_STATUS', (event) => {
      const { status, message } = event.payload;
      setStatuses(prev => prev.map(s => 
        s.status === 'downloading' ? { ...s, status: status as any, message } : s
      ));
      if (status !== 'downloading') {
        setIsDownloading(false);
      }
    });

    return () => { 
      unlisten.then((unlistenFn) => unlistenFn()); 
    };
  }, []);

  const value: DownloadContextType = {
    statuses,
    setStatuses,
    isDownloading,
    setIsDownloading,
    addStatus,
    clearStatuses,
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
};
