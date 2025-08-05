import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export interface StatusItem {
  id: number;
  title: string;
  status: 'downloading' | 'success' | 'error' | 'cancelled';
  message: string;
}

export interface FormatOption {
  id: string;
  label: string;
  quality: string;
  type: 'video' | 'audio';
  icon: React.ElementType;
  selector: string;
}

interface DownloadPayload {
  status: string;
  message: string;
  download_id?: string;
}

interface DownloadContextType {
  statuses: StatusItem[];
  setStatuses: React.Dispatch<React.SetStateAction<StatusItem[]>>;
  isDownloading: boolean;
  setIsDownloading: React.Dispatch<React.SetStateAction<boolean>>;
  currentDownloadId: string | null;
  setCurrentDownloadId: React.Dispatch<React.SetStateAction<string | null>>;
  addStatus: (status: Omit<StatusItem, 'id'>) => void;
  clearStatuses: () => void;
  cancelDownload: () => void;
  
  // URL and analysis state
  url: string;
  setUrl: React.Dispatch<React.SetStateAction<string>>;
  isYoutube: boolean;
  isSpotify: boolean;
  isPlaylist: boolean;
  selectedFormat: FormatOption;
  setSelectedFormat: React.Dispatch<React.SetStateAction<FormatOption>>;
  
  // Playlist state
  playlistEntries: any[];
  setPlaylistEntries: React.Dispatch<React.SetStateAction<any[]>>;
  selectedEntries: Set<string>;
  setSelectedEntries: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasTriedFetch: boolean;
  setHasTriedFetch: React.Dispatch<React.SetStateAction<boolean>>;
  isFetchingPlaylist: boolean;
  setIsFetchingPlaylist: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);
  
  // URL and analysis state
  const [url, setUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<FormatOption>({
    id: '720p',
    label: '720p MP4',
    quality: 'Standard quality video',
    type: 'video',
    icon: () => null,
    selector: "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=720][vcodec^=avc]"
  });
  
  // Playlist state
  const [playlistEntries, setPlaylistEntries] = useState<any[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [hasTriedFetch, setHasTriedFetch] = useState(false);
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);

  // URL analysis helpers
  const isYoutube = (() => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  })();

  const isSpotify = (() => {
    const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/.+/;
    return spotifyRegex.test(url);
  })();

  const isPlaylist = (() => {
    return url.includes("list=");
  })();

  // Reset playlist state when URL changes
  React.useEffect(() => {
    setHasTriedFetch(false);
    setPlaylistEntries([]);
    setSelectedEntries(new Set());
  }, [url]);

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

  const cancelDownload = async () => {
    if (currentDownloadId) {
      try {
        console.log('Cancelling download with ID:', currentDownloadId);
        await invoke('cancel_download', { downloadId: currentDownloadId });
        setCurrentDownloadId(null);
        setIsDownloading(false);
        console.log('Download cancelled successfully');
      } catch (error) {
        console.error('Failed to cancel download:', error);
      }
    } else {
      console.log('No current download ID to cancel');
    }
  };

  // Listen for download status updates
  useEffect(() => {
    const unlisten = listen<DownloadPayload>('DOWNLOAD_STATUS', (event) => {
      const { status, message, download_id } = event.payload;
      console.log('Download status event:', { status, message, download_id });
      
      // Set current download ID when download starts
      if (status === 'downloading' && download_id) {
        console.log('Setting download ID:', download_id);
        setCurrentDownloadId(download_id);
        setIsDownloading(true);
      }
      
      // Clear download ID when download ends
      if (status !== 'downloading') {
        console.log('Clearing download ID, status:', status);
        setCurrentDownloadId(null);
        setIsDownloading(false);
      }
      
      setStatuses(prev => prev.map(s => 
        s.status === 'downloading' ? { ...s, status: status as any, message } : s
      ));
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
    currentDownloadId,
    setCurrentDownloadId,
    addStatus,
    clearStatuses,
    cancelDownload,
    
    // URL and analysis state
    url,
    setUrl,
    isYoutube,
    isSpotify,
    isPlaylist,
    selectedFormat,
    setSelectedFormat,
    
    // Playlist state
    playlistEntries,
    setPlaylistEntries,
    selectedEntries,
    setSelectedEntries,
    hasTriedFetch,
    setHasTriedFetch,
    isFetchingPlaylist,
    setIsFetchingPlaylist,
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
};
