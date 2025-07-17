import { Download, Trash2, Video, Music, CheckCircle, XCircle, Loader, Link as LinkIcon, Settings, Activity, ChevronDown, Info, ListVideo } from 'lucide-react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { BaseDirectory, readTextFile } from '@tauri-apps/api/fs';
import { Link } from 'react-router-dom';

// --- TYPE DEFINITIONS ---
interface FormatOption {
  id: string;
  label: string;
  quality: string;
  type: 'video' | 'audio';
  icon: React.ElementType;
  selector: string;
}

interface StatusItem {
  id: number;
  title: string;
  status: 'downloading' | 'success' | 'error';
  message: string;
}

interface DownloadPayload {
  status: string;
  message: string;
}

interface ActionProps {
  onDownload: () => void;
  isDownloading: boolean;
  statuses: StatusItem[];
}

interface PlaylistEntry {
    id: string;
    title: string;
    thumbnail: string | null;
}

const SETTINGS_FILE = 'settings.json';

// --- CONSTANTS ---
const FORMAT_OPTIONS: FormatOption[] = [
    { id: '1080p', label: '1080p MP4', quality: 'High quality video', type: 'video', icon: Video, selector: "bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=1080][vcodec^=avc]" },
    { id: '720p', label: '720p MP4', quality: 'Standard quality video', type: 'video', icon: Video, selector: "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=720][vcodec^=avc]" },
    { id: '480p', label: '480p MP4', quality: 'Low quality video', type: 'video', icon: Video, selector: "bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480][vcodec^=avc]" },
    { id: 'mp3_320', label: 'MP3 320kbps', quality: 'High quality audio', type: 'audio', icon: Music, selector: "bestaudio[acodec=mp3]/bestaudio" },
    { id: 'mp3_128', label: 'MP3 128kbps', quality: 'Standard quality audio', type: 'audio', icon: Music, selector: "bestaudio[acodec=mp3][abr<=128]/bestaudio" },
];

// --- Helper Function ---
const isYoutubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    return youtubeRegex.test(url);
};

const isSpotifyUrl = (url: string): boolean => {
    const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/.+$/;
    return spotifyRegex.test(url);
}

const isPlaylistUrl = (url: string): boolean => {
    return url.includes("list=");
}

// --- MAIN DOWNLOADER PAGE COMPONENT ---
const DownloaderPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<FormatOption>(FORMAT_OPTIONS[1]);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(true);

  const [playlistEntries, setPlaylistEntries] = useState<PlaylistEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);

  const isYoutube = useMemo(() => isYoutubeUrl(url), [url]);
  const isSpotify = useMemo(() => isSpotifyUrl(url), [url]);
  const isPlaylist = useMemo(() => isYoutube && isPlaylistUrl(url), [url, isYoutube]);

  // Automatically switch format for Spotify links
  useEffect(() => {
    if (isSpotify) {
      const mp3Format = FORMAT_OPTIONS.find(f => f.id === 'mp3_320');
      if (mp3Format) {
        setSelectedFormat(mp3Format);
      }
    }
  }, [isSpotify]);

  // Fetch playlist info when a valid playlist URL is entered
  useEffect(() => {
      if (isPlaylist) {
          const fetchPlaylist = async () => {
              setIsFetchingPlaylist(true);
              setPlaylistEntries([]);
              setSelectedEntries(new Set());
              try {
                  const entries: PlaylistEntry[] = await invoke('get_playlist_info', { url });
                  setPlaylistEntries(entries);
              } catch (e) {
                  console.error("Failed to fetch playlist info:", e);
                  // --- DIAGNOSTIC ---
                  // Show the error in the status list for visibility
                  const newStatus: StatusItem = {
                      id: Date.now(),
                      title: "Failed to fetch playlist",
                      status: 'error',
                      message: String(e),
                  };
                  setStatuses(prev => [newStatus, ...prev]);
              } finally {
                  setIsFetchingPlaylist(false);
              }
          };
          fetchPlaylist();
      } else {
          setPlaylistEntries([]);
      }
  }, [isPlaylist, url]);

  // Re-check settings when the page is focused or statuses change
  useEffect(() => {
    const loadDownloadPath = async () => {
        try {
            // No need to load path here, backend will do it.
            // We just need to know if it's configured.
            await invoke('load_settings');
            setNeedsConfig(false);
        } catch(e) {
            setNeedsConfig(true);
        }
    };
    loadDownloadPath();

    const unlisten = listen<DownloadPayload>('DOWNLOAD_STATUS', (event) => {
      const { status, message } = event.payload;
      setStatuses(prev => prev.map(s => 
        s.status === 'downloading' ? { ...s, status: status as any, message } : s
      ));
      if (status !== 'downloading') {
        setIsDownloading(false);
      }
    });
    return () => { unlisten.then((unlistenFn) => unlistenFn()); };
  }, [statuses]);

  const handleDownload = useCallback(async () => {
    if (isDownloading || needsConfig) return;

    let itemsToDownload: { url: string, title: string }[] = [];

    if (isPlaylist) {
        if (selectedEntries.size === 0) return;
        itemsToDownload = playlistEntries
            .filter(entry => selectedEntries.has(entry.id))
            .map(entry => ({
                url: `https://www.youtube.com/watch?v=${entry.id}`,
                title: entry.title
            }));
    } else {
        if (!url.trim()) return;
        
        setIsDownloading(true);
        const newStatusId = Date.now();

        setStatuses(prev => [{
            id: newStatusId,
            title: "Fetching title...",
            status: 'downloading',
            message: `Getting title for ${url}`,
        }, ...prev]);

        try {
            // Step 1: Get the actual title from the backend
            const title = await invoke<string>('get_media_title', { url });

            // Step 2: Update status with real title and prepare for download
            setStatuses(prev => prev.map(s => 
                s.id === newStatusId ? { ...s, title, message: 'Preparing to download...' } : s
            ));
            itemsToDownload = [{ url, title }];

        } catch (error) {
            setStatuses(prev => prev.map(s => 
                s.id === newStatusId ? { ...s, status: 'error', message: `Failed to get title: ${String(error)}` } : s
            ));
            setIsDownloading(false);
            return;
        }
    }
    
    // This part now handles both single and playlist downloads
    for (const item of itemsToDownload) {
        // If it's a single download, the status is already set. For playlists, we create it now.
        if (!isPlaylist) {
            // The download logic for single items is now here
            const qualitySelector = isYoutube || isSpotify
                ? selectedFormat.selector
                : "best[ext=mp4]/best";
            try {
                await invoke('download_media', {
                    url: item.url,
                    quality: qualitySelector,
                    formatType: selectedFormat.type
                });
            } catch (error) {
                setStatuses(prev => prev.map(s => 
                    s.title === item.title && s.status === 'downloading' ? { ...s, status: 'error', message: String(error) } : s
                ));
            }
        } else {
            // Playlist logic remains similar
            const newStatus: StatusItem = {
                id: Date.now() + Math.random(),
                title: item.title,
                status: 'downloading',
                message: 'Preparing to download...',
            };
            setStatuses(prev => [newStatus, ...prev]);

            const qualitySelector = selectedFormat.selector;
            try {
                await invoke('download_media', {
                    url: item.url,
                    quality: qualitySelector,
                    formatType: selectedFormat.type
                });
            } catch (error) {
                setStatuses(prev => prev.map(s => 
                    s.id === newStatus.id ? { ...s, status: 'error', message: String(error) } : s
                ));
            }
        }
    }
    // Let the event listener handle the final state change
  }, [isDownloading, needsConfig, isPlaylist, url, selectedEntries, playlistEntries, selectedFormat, isYoutube, isSpotify]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Media Downloader</h1>
          <p className="text-gray-400 mt-1">Download videos and music from YouTube</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/your-repo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-gray-300"
          >
            <LinkIcon size={16} />
            <span>Documentation</span>
          </a>
        </div>
      </div>

      {needsConfig && (
        <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-400/10 border border-amber-400/20">
          <div className="flex-shrink-0 p-3 bg-amber-400/20 rounded-lg">
            <Settings className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-amber-400">Download Location Not Configured</h3>
            <p className="text-sm text-amber-400/80 mt-0.5">
              Please visit the{" "}
              <Link to="/settings" className="font-medium underline underline-offset-2 hover:text-amber-300">
                Settings
              </Link>{" "}
              page to set up your download location.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <LinkIcon size={20} className="text-blue-400" />
              </div>
              <div>
                <h2 className="font-medium text-white">Media URL</h2>
                <p className="text-sm text-gray-400">Enter the YouTube video URL</p>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
              />
              {url && (
                <button
                  onClick={() => setUrl("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                      <Video size={20} className="text-purple-400" />
                  </div>
                  <div>
                      <h2 className="font-medium text-white">Output Format</h2>
                      <p className="text-sm text-gray-400">Choose your preferred format</p>
                  </div>
              </div>
              {!isPlaylist ? (
                  <FormatSelector selected={selectedFormat} onSelect={setSelectedFormat} />
              ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-500/10 border border-gray-500/20">
                      <Info size={18} className="text-gray-400 flex-shrink-0" />
                      <div>
                          <p className="text-sm font-medium text-gray-300">
                            Select videos from the playlist below and then click "Download Selected".
                          </p>
                      </div>
                  </div>
              )}
          </div>

          {isPlaylist ? (
              <PlaylistView
                  entries={playlistEntries}
                  selectedEntries={selectedEntries}
                  setSelectedEntries={setSelectedEntries}
                  isFetching={isFetchingPlaylist}
                  onDownload={handleDownload}
                  isDownloading={isDownloading}
              />
          ) : (
              <button
                onClick={handleDownload}
                disabled={isDownloading || !url.trim() || needsConfig}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium h-12 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-2">
                  {isDownloading ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Download Now</span>
                    </>
                  )}
                </div>
              </button>
          )}
        </div>

        <div className="flex-1 p-6 rounded-2xl bg-white/5 border border-white/5 min-h-[300px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gray-500/10">
              <Activity size={20} className="text-gray-400" />
            </div>
            <div>
              <h2 className="font-medium text-white">Download Status</h2>
              <p className="text-sm text-gray-400">Track your downloads</p>
            </div>
          </div>
          <div className="space-y-3">
            {statuses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
                <Download size={24} className="mb-2 opacity-50" />
                <p className="text-sm">No downloads yet</p>
              </div>
            ) : (
              statuses.map((status: StatusItem) => (
                <StatusItemComponent key={status.id} {...status} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- NEW PLAYLIST COMPONENT ---
interface PlaylistViewProps {
    entries: PlaylistEntry[];
    selectedEntries: Set<string>;
    setSelectedEntries: React.Dispatch<React.SetStateAction<Set<string>>>;
    isFetching: boolean;
    onDownload: () => void;
    isDownloading: boolean;
}

const PlaylistView: React.FC<PlaylistViewProps> = ({ entries, selectedEntries, setSelectedEntries, isFetching, onDownload, isDownloading }) => {
    
    const handleSelectAll = () => {
        if (selectedEntries.size === entries.length) {
            setSelectedEntries(new Set()); // Deselect all
        } else {
            setSelectedEntries(new Set(entries.map(e => e.id))); // Select all
        }
    };

    const handleEntryToggle = (id: string) => {
        const newSelection = new Set(selectedEntries);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedEntries(newSelection);
    };

    if (isFetching) {
        return (
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 h-64 flex items-center justify-center">
                <Loader size={24} className="animate-spin text-gray-400" />
                <p className="ml-3 text-gray-400">Fetching playlist...</p>
            </div>
        );
    }

    return (
        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                        <ListVideo size={20} className="text-green-400" />
                    </div>
                    <div>
                        <h2 className="font-medium text-white">Playlist Content</h2>
                        <p className="text-sm text-gray-400">{entries.length} videos found</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSelectAll} className="px-3 py-1 text-xs font-medium rounded-md bg-white/10 hover:bg-white/20 transition-colors">
                        {selectedEntries.size === entries.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={onDownload}
                      disabled={isDownloading || selectedEntries.size === 0}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 text-white flex items-center gap-1"
                    >
                      {isDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                      Download Selected
                    </button>
                </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {entries.map(entry => (
                    <div
                        key={entry.id}
                        onClick={() => handleEntryToggle(entry.id)}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedEntries.has(entry.id) ? 'bg-blue-500/20' : 'hover:bg-white/5'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={selectedEntries.has(entry.id)}
                            readOnly
                            className="form-checkbox h-4 w-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-0"
                        />
                        {entry.thumbnail ? (
                            <img src={entry.thumbnail} alt={entry.title} className="w-16 h-9 rounded object-cover flex-shrink-0" />
                        ) : (
                            <div className="w-16 h-9 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <Video size={18} className="text-gray-400" />
                            </div>
                        )}
                        <p className="text-sm text-gray-300 truncate" title={entry.title}>{entry.title}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- CHILD COMPONENTS ---
interface MediaInputProps {
  url: string;
  setUrl: (url: string) => void;
  selectedFormat: FormatOption;
  setSelectedFormat: (format: FormatOption) => void;
}
const MediaInputSection: React.FC<MediaInputProps> = ({ url, setUrl, selectedFormat, setSelectedFormat }) => (
  <div className="space-y-6">
      <div>
      <label htmlFor="media-url" className="block text-sm font-medium text-gray-300 mb-2">MEDIA URL</label>
      <div className="relative">
        <input
          id="media-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-gray-500"
          placeholder="Paste YouTube URL here..."
        />
        {url && (
          <button
            onClick={() => setUrl("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white transition-colors"
          >
            <Trash2 size={18} />
          </button>
        )}
        </div>
      </div>
      <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">OUTPUT FORMAT</label>
        <FormatSelector selected={selectedFormat} onSelect={setSelectedFormat} />
      </div>
    </div>
);

const ActionSection: React.FC<ActionProps> = ({ onDownload, isDownloading, statuses }) => (
  <div className="space-y-6">
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">ACTION</h3>
      <button
        onClick={onDownload}
        disabled={isDownloading}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-blue-800 disabled:to-blue-900 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-blue-500/20"
      >
        {isDownloading ? (
          <Loader className="animate-spin" size={20} />
        ) : (
          <Download size={20} />
        )}
        <span>{isDownloading ? "Downloading..." : "Download"}</span>
      </button>
    </div>
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">DOWNLOAD STATUS</h3>
      <div className="bg-gray-800/50 rounded-xl p-4 space-y-3 h-[300px] overflow-y-auto">
        {statuses.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Download size={24} className="mb-2 opacity-50" />
            <p>Download status will appear here</p>
          </div>
        )}
        {statuses.map((status: StatusItem) => (
          <StatusItemComponent key={status.id} {...status} />
        ))}
      </div>
      </div>
    </div>
);

// --- HELPER & UI COMPONENTS ---
const FormatSelector: React.FC<{ selected: FormatOption; onSelect: (format: FormatOption) => void }> = ({
  selected,
  onSelect,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-lg bg-white/5">
            <selected.icon size={20} className="text-gray-300" />
          </div>
          <div className="text-left">
            <p className="font-medium text-white">{selected.label}</p>
            <p className="text-sm text-gray-400">{selected.quality}</p>
                    </div>
                </div>
        <ChevronDown
          size={20}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 py-2 bg-[#1A1A1F] border border-white/10 rounded-xl shadow-xl">
          {FORMAT_OPTIONS.map((format) => (
            <button
              key={format.id}
              onClick={() => {
                onSelect(format);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors ${
                format.id === selected.id ? "bg-white/5" : ""
              }`}
            >
              <div className="p-2 rounded-lg bg-white/5">
                <format.icon size={20} className="text-gray-300" />
              </div>
              <div className="text-left">
                <p className="font-medium text-white">{format.label}</p>
                <p className="text-sm text-gray-400">{format.quality}</p>
              </div>
            </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const StatusItemComponent: React.FC<StatusItem> = ({ title, status, message }) => {
  const getStatusConfig = () => {
        switch (status) {
      case "downloading":
        return {
          icon: <Loader size={20} className="text-blue-400 animate-spin" />,
          bgColor: "bg-blue-400/10",
          borderColor: "border-blue-400/20",
          textColor: "text-blue-400",
        };
      case "success":
        return {
          icon: <CheckCircle size={20} className="text-emerald-400" />,
          bgColor: "bg-emerald-400/10",
          borderColor: "border-emerald-400/20",
          textColor: "text-emerald-400",
        };
      case "error":
        return {
          icon: <XCircle size={20} className="text-red-400" />,
          bgColor: "bg-red-400/10",
          borderColor: "border-red-400/20",
          textColor: "text-red-400",
        };
        }
    };

  const config = getStatusConfig();

    return (
    <div className={`${config.bgColor} ${config.borderColor} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">{config.icon}</div>
        <div>
          <h4 className="font-medium text-white text-sm truncate" title={title}>
            {title}
          </h4>
          <p className={`text-sm mt-1 ${config.textColor}`}>
            {status === "downloading" ? "Downloading in progress..." : message.split("\n")[0]}
          </p>
        </div>
            </div>
        </div>
    );
};

export default DownloaderPage; 