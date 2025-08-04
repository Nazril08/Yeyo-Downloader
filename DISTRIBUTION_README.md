# Yeyo Downloader - Distribution Setup

## Prerequisites

Before running Yeyo Downloader, you need to have the following installed on your system:

### 1. Python Installation
Download and install Python from [python.org](https://www.python.org/downloads/)

**During installation, make sure to:**
- ✅ Check "Add Python to PATH"
- ✅ Check "Install for all users" (recommended)

### 2. Install Required Python Packages

Open Command Prompt or PowerShell as Administrator and run:

```bash
pip install yt-dlp requests
```

Or if you prefer, use the requirements file:
```bash
pip install -r requirements.txt
```

### 3. Alternative Python Commands

If you have issues with `python` command, the application will try these alternatives:
- `python` (default)
- `python3` (common on Linux/Mac)
- `py` (Python Launcher on Windows)

## Usage

1. Launch `yeyo_downloader.exe`
2. Enter a YouTube URL (single video or playlist)
3. Select your preferred format
4. Choose download location in Settings
5. Click Download

## Troubleshooting

### "Failed to execute python script: program not found"

**Solution 1:** Ensure Python is installed and in PATH
- Open Command Prompt
- Type `python --version` 
- You should see Python version number

**Solution 2:** Try alternative Python installation
- Download from Microsoft Store: "Python 3.11" or "Python 3.12"
- This automatically adds Python to PATH

**Solution 3:** Manual PATH setup
1. Find your Python installation (usually in `C:\Users\[YourName]\AppData\Local\Programs\Python\`)
2. Add the Python folder to your system PATH
3. Restart the application

### "Module not found" errors

Run these commands:
```bash
pip install --upgrade yt-dlp requests
```

### Playlist issues

- Large playlists (>50 videos) are automatically limited for performance
- YouTube Mix playlists may contain many videos - this is normal

## Features

- ✅ Single video downloads
- ✅ Playlist downloads (limited to 50 videos)
- ✅ Multiple format options (MP4, WebM, Audio only)
- ✅ Custom download location
- ✅ Thumbnail display for playlists
- ✅ Download progress tracking

## Support

If you encounter issues:
1. Ensure Python and yt-dlp are installed correctly
2. Check that your internet connection is stable
3. Verify the YouTube URL is valid and accessible

For more help, visit the project repository or contact the developer.
