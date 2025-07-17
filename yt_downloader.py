import sys
import subprocess
import json
import re
import requests  # Import requests
import os  # Import the os module
from urllib.parse import urlparse, parse_qs

def get_playlist_info(playlist_url):
    """
    Fetches information about each video in a playlist.
    Uses --flat-playlist for efficiency.
    """
    try:
        command = [
            "yt-dlp",
            "--flat-playlist",
            "-j", # Output JSON
            playlist_url # Pass the ID directly
        ]

        # --- DIAGNOSTIC ---
        print(f"DEBUG: Executing command: {' '.join(command)}", file=sys.stderr)
        
        result = subprocess.run(command, check=False, capture_output=True, text=True, encoding='utf-8')

        # --- DIAGNOSTIC ---
        # Always print stderr for debugging purposes, even on success.
        if result.stderr:
            print(f"DEBUG: yt-dlp stderr:\n{result.stderr}", file=sys.stderr)

        # Check for success AND non-empty output
        if result.returncode == 0 and result.stdout.strip():
            # Success. Now we must parse the line-delimited JSON into a single, valid JSON array.
            entries = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    try:
                        data = json.loads(line)
                        video_id = data.get("id")
                        video_title = data.get("title")

                        # We must have an ID and a title to consider the entry valid.
                        # Thumbnail is optional.
                        if video_id and video_title:
                            entries.append({
                                "id": video_id,
                                "title": video_title,
                                "thumbnail": data.get("thumbnail"), # Can be null
                            })
                    except json.JSONDecodeError as e:
                        print(f"FATAL PYTHON ERROR: Failed to parse a line of yt-dlp JSON output: {e}", file=sys.stderr)
                        sys.exit(1)
            
            # Print the final list as a single JSON array string
            print(json.dumps(entries))
        else:
            # Failure case
            error_message = f"Error: yt-dlp command failed or returned empty output.\n"
            error_message += f"Return Code: {result.returncode}\n"
            if not result.stdout.strip():
                error_message += "Reason: yt-dlp produced no video data (stdout was empty).\n"
            
            # Append stderr from yt-dlp if it exists, otherwise say it was empty.
            if result.stderr.strip():
                error_message += f"Details from yt-dlp:\n{result.stderr}"
            else:
                error_message += "yt-dlp provided no error details (stderr was empty)."
            
            print(error_message, file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"FATAL PYTHON ERROR in get_playlist_info: {e}", file=sys.stderr)
        sys.exit(1)

def get_title_from_spotify_url(url):
    """
    Fetches the HTML of a Spotify URL and extracts the content of the <title> tag.
    """
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()  # Raise an exception for bad status codes
        
        # Extract text from the <title> tag
        title_match = re.search(r'<title>(.*?)</title>', response.text)
        if title_match:
            # Clean up the title (e.g., "Glimpse of Us - song by Joji | Spotify")
            raw_title = title_match.group(1)
            # Remove everything after " - song by" or " | Spotify"
            clean_title = re.split(r' - song by | \| Spotify', raw_title)[0]
            return clean_title.strip()
            
    except requests.RequestException as e:
        print(f"Error fetching Spotify URL: {e}", file=sys.stderr)
    return None

def get_media_title(url):
    """
    Uses yt-dlp to get the prospective filename (title) for a URL
    without actually downloading the file.
    """
    is_spotify_url = "open.spotify.com" in url
    final_url = url

    if is_spotify_url:
        title = get_title_from_spotify_url(url)
        if title:
            final_url = f"ytsearch1:{title}"
        else:
            print("Error: Could not fetch title from Spotify URL.", file=sys.stderr)
            sys.exit(1)

    try:
        command = [
            "yt-dlp",
            "--print", "filename",
            "--no-playlist",
            "-o", "%(title)s.%(ext)s",
            final_url
        ]
        
        # --- DIAGNOSTIC ---
        print(f"DEBUG: Executing command to get title: {' '.join(command)}", file=sys.stderr)

        result = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8')
        
        # The filename is in stdout.
        # We must strip any newline characters from it.
        filename = result.stdout.strip()
        
        if filename:
            print(filename) # This will be the return value to the frontend
        else:
            print("Error: yt-dlp did not return a filename.", file=sys.stderr)
            sys.exit(1)

    except subprocess.CalledProcessError as e:
        error_message = e.stderr
        print(f"Error: Failed to get media title.\nDetails: {error_message}", file=sys.stderr)
        sys.exit(1)


def download_media(url, quality_selector, format_type, output_path):
    """
    Downloads a single media file based on a URL, a format selector, and format type.
    """
    is_spotify_url = "open.spotify.com" in url
    final_url = url

    if is_spotify_url:
        print("Spotify URL detected. Fetching title to search on YouTube...", file=sys.stderr)
        title = get_title_from_spotify_url(url)
        if title:
            print(f"Found title: '{title}'. Searching on YouTube.", file=sys.stderr)
            final_url = f"ytsearch1:{title}"  # Search for the first result on YouTube
        else:
            print("Error: Could not fetch title from Spotify URL. Aborting.", file=sys.stderr)
            sys.exit(1)

    try:
        # Determine the subdirectory based on the format type
        sub_dir = "Audio" if format_type == "audio" else "Video"
        final_output_path = os.path.join(output_path, sub_dir)

        command = [
            "yt-dlp",
            "--verbose",
            "-f", quality_selector,
        ]

        if format_type == "audio":
            command.extend(["-x", "--audio-format", "mp3"])
        else:
            command.extend(["--merge-output-format", "mp4"])

        command.extend([
            "--no-playlist",
            "-o", os.path.join(final_output_path, "%(title)s.%(ext)s"),
            final_url
        ])
        
        # --- DIAGNOSTIC ---
        print(f"DEBUG: Executing command: {' '.join(command)}", file=sys.stderr)

        result = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8')
        
        # --- DIAGNOSTIC ---
        if result.stderr:
            print(f"DEBUG: yt-dlp stderr:\n{result.stderr}", file=sys.stderr)

        print("Success: Media downloaded successfully.")
        print(result.stdout)
    except FileNotFoundError:
        print("Error: yt-dlp not found. Make sure it's installed and in your PATH.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        error_message = e.stderr
        print(f"Error: Download process failed for command: {' '.join(command)}\nDetails: {error_message}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Error: Insufficient arguments. Received: {sys.argv}", file=sys.stderr)
        sys.exit(1)

    action = sys.argv[1]
    
    if action == "get-playlist-info":
        if len(sys.argv) == 3:
            playlist_url = sys.argv[2]
            get_playlist_info(playlist_url)
        else:
            print(f"Error: Invalid arguments for get-playlist-info. Expected <url>. Received: {sys.argv}", file=sys.stderr)
            sys.exit(1)

    elif action == "get-title":
        if len(sys.argv) == 3:
            media_url = sys.argv[2]
            get_media_title(media_url)
        else:
            print(f"Error: Invalid arguments for get-title. Expected <url>. Received: {sys.argv}", file=sys.stderr)
            sys.exit(1)

    elif action == "download":
        if len(sys.argv) == 6:
            video_url = sys.argv[2]
            quality = sys.argv[3]
            format_type = sys.argv[4]
            output_path = sys.argv[5]
            download_media(video_url, quality, format_type, output_path)
        else:
            print(f"Error: Invalid arguments for download. Expected <url> <quality> <format_type> <output_path>. Received: {sys.argv}", file=sys.stderr)
            sys.exit(1)
            
    else:
        print(f"Error: Unknown action '{action}'.", file=sys.stderr)
        sys.exit(1) 