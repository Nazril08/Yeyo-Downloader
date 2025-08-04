@echo off
echo Installing FFmpeg for Windows...
echo.

REM Check if FFmpeg is already installed
ffmpeg -version >nul 2>&1
if %errorlevel% == 0 (
    echo FFmpeg is already installed and available in PATH.
    pause
    exit /b 0
)

echo FFmpeg not found. Installing via winget...
echo.

REM Try to install via winget (Windows Package Manager)
winget install --id=Gyan.FFmpeg -e
if %errorlevel% == 0 (
    echo.
    echo FFmpeg installed successfully via winget!
    echo Please restart your terminal or application.
    pause
    exit /b 0
)

echo.
echo Winget installation failed. Trying alternative method...
echo.

REM Alternative: Download and extract FFmpeg manually
echo Downloading FFmpeg from official source...
powershell -Command "& {Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile 'ffmpeg.zip'}"

if exist ffmpeg.zip (
    echo Extracting FFmpeg...
    powershell -Command "& {Expand-Archive -Path 'ffmpeg.zip' -DestinationPath '.' -Force}"
    
    REM Find the extracted folder
    for /d %%i in (ffmpeg-*) do set FFMPEG_DIR=%%i
    
    if defined FFMPEG_DIR (
        echo Moving FFmpeg to Program Files...
        if not exist "C:\ffmpeg" mkdir "C:\ffmpeg"
        xcopy "%FFMPEG_DIR%\bin\*" "C:\ffmpeg\" /Y
        
        echo Adding FFmpeg to PATH...
        setx PATH "%PATH%;C:\ffmpeg" /M
        
        echo Cleaning up temporary files...
        del ffmpeg.zip
        rmdir /s /q "%FFMPEG_DIR%"
        
        echo.
        echo FFmpeg installed successfully!
        echo Please restart your terminal or application.
    ) else (
        echo Error: Could not find extracted FFmpeg folder.
    )
) else (
    echo Error: Could not download FFmpeg.
)

echo.
echo Installation complete. Press any key to exit.
pause
