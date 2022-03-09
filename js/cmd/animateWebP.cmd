@ECHO OFF
SET magick=C:\Users\slouv\OneDrive\Tools\bin\Image\magick.exe
SET ffmpeg=C:\Users\slouv\OneDrive\Tools\bin\ffmpeg\ffmpeg.exe
SET makewebm=C:\Users\slouv\OneDrive\Tools\bin\Image\webp\makewebm.exe
SET cwebp=C:\Users\slouv\OneDrive\Tools\bin\Image\webp\cwebp.exe
SET img2webp=C:\Users\slouv\OneDrive\Tools\bin\Image\webp\img2webp.exe

PUSHD "%~dp0..\node\playthrough"

"%magick%" -quality 70 -loop 1 -delay 75 "*.png" "..\..\animation.magick.webp"
"%ffmpeg%" -r 1 -i "S%%03d.png" -c:v libwebp -filter:v fps=fps=1 -lossless 0 -q:v 70 ..\..\animation.ffmpeg.webp
"%ffmpeg%" -r 1 -i "S%%03d.png" -filter:v fps=fps=1 -lossless 0 -q:v 70 ..\..\animation.ffmpeg.webm

:: Have to list every input file; can make args file with all arguments.
ECHO -o ..\..\animation.i2w.webp -loop 1 -lossy -q 70 -d 750 > "..\args.txt"
DIR /b *.png >> "..\args.txt"
"%img2webp%" "..\args.txt"
DEL /F "..\args.txt"
POPD