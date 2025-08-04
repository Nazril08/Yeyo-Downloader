import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { Folder, Save, Settings as SettingsIcon, HardDrive, Info, CheckCircle, XCircle, Image } from 'lucide-react';

interface Settings {
    download_path: string;
    enable_thumbnails: boolean;
}

const SettingsPage: React.FC = () => {
    const [downloadPath, setDownloadPath] = useState<string>('');
    const [enableThumbnails, setEnableThumbnails] = useState<boolean>(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings: Settings = await invoke('load_settings');
                setDownloadPath(settings.download_path);
                setEnableThumbnails(settings.enable_thumbnails);
            } catch (e) {
                setMessage({ type: 'error', text: `Failed to load settings: ${e}` });
            }
        };
        loadSettings();
    }, []);

    const handleSelectFolder = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            defaultPath: downloadPath,
        });
        if (typeof selected === 'string') {
            setDownloadPath(selected);
        }
    };

    const handleSaveChanges = async () => {
        try {
            await invoke('save_settings', { 
                settings: { 
                    download_path: downloadPath,
                    enable_thumbnails: enableThumbnails
                } 
            });
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch(e) {
            setMessage({ type: 'error', text: `Failed to save settings: ${e}` });
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
                        <SettingsIcon className="w-7 h-7" />
                        Settings
                    </h1>
                    <p className="text-gray-400 mt-1">Configure your application preferences</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-lg bg-purple-500/10">
                                <HardDrive size={20} className="text-purple-400" />
                            </div>
                            <div>
                                <h2 className="font-medium text-white">Storage Location</h2>
                                <p className="text-sm text-gray-400">Choose where to save your downloads</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    DEFAULT DOWNLOAD LOCATION
                                </label>
                    <div className="relative">
                                    <input
                                        type="text"
                                        value={downloadPath}
                                        readOnly
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-32 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/30 transition-all"
                                    />
                                    <button
                                        onClick={handleSelectFolder}
                                        className="absolute inset-y-0 right-0 flex items-center px-4 gap-2 text-gray-300 hover:text-white bg-white/5 rounded-r-xl transition-colors border-l border-white/10"
                                    >
                                        <Folder size={18} />
                                        <span>Browse</span>
                        </button>
                    </div>
                </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-3">
                                    PLAYLIST THUMBNAILS
                                </label>
                                <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                                    <div>
                                        <h4 className="text-white font-medium">Enable High-Quality Thumbnails</h4>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Fetch high-quality thumbnails for playlist videos. Disabling this will speed up playlist loading but show default thumbnails.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setEnableThumbnails(!enableThumbnails)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            enableThumbnails ? 'bg-purple-500' : 'bg-gray-600'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                enableThumbnails ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4">
                                <button
                                    onClick={handleSaveChanges}
                                    className="bg-purple-500 hover:bg-purple-600 text-white font-medium h-10 px-6 rounded-xl flex items-center gap-2 transition-colors"
                                >
                        <Save size={18} />
                        <span>Save Changes</span>
                    </button>

                                {message && (
                                    <div
                                        className={`rounded-xl px-4 py-2 flex items-center gap-2 ${
                                            message.type === 'success'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-red-500/10 text-red-400'
                                        }`}
                                    >
                                        {message.type === 'success' ? (
                                            <CheckCircle size={18} />
                                        ) : (
                                            <XCircle size={18} />
                                        )}
                                        <span className="text-sm">{message.text}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Info size={20} className="text-blue-400" />
                            </div>
                            <div>
                                <h2 className="font-medium text-white">About</h2>
                                <p className="text-sm text-gray-400">Application information</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-300">Version</h3>
                                <p className="text-sm text-gray-400 mt-1">1.0.0</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-300">Developer</h3>
                                <p className="text-sm text-gray-400 mt-1">Your Name</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-300">License</h3>
                                <p className="text-sm text-gray-400 mt-1">MIT</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/5">
                        <h3 className="font-medium text-white mb-2">Need Help?</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Check out our documentation for detailed instructions and examples.
                        </p>
                        <a
                            href="https://github.com/your-repo"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            View Documentation →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage; 