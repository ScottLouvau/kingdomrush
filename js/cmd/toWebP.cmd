@ECHO OFF
SET magick=C:\Users\slouv\OneDrive\Tools\bin\Image\magick.exe
SET cwebp=C:\Users\slouv\OneDrive\Tools\bin\Image\webp\cwebp.exe
SET InputFolder=%~1
SET OutputFolder=%~2
SET Quality=%~3
SET Args=%~4

IF "%Quality%"=="" (SET Quality=70)
IF "%OutputFolder%"=="" (SET OutputFolder=%InputFolder%\..\WebP.Q%Quality%)

ECHO.
ECHO Converting "%InputFolder%" to WebP Q%Quality% at "%OutputFolder%"...

IF NOT EXIST "%OutputFolder%" (MD "%OutputFolder%")
FOR %%C IN (%InputFolder%\*.*) DO (
    ECHO - %%~nxC
    "%magick%" "%%C" %Args% -quality %Quality% -set filename:name %%t "%OutputFolder%\%%[filename:name].webp"
)


::"%magick%" "%%C" -quality %Quality% -set filename:name %%t "%OutputFolder%\%%[filename:name].webp"
::"%cwebp%" -q %Quality% "%%C" -o "%OutputFolder%\%%~nC.webp"

:: cwebp and magick results seem to be essentially identical.

:: -quality 50
:: 675 KB -define webp:lossless=true
:: 200 KB -define webp:near-lossless=90 [nl70 the same]

::  70 KB -quality 10  [Comparable to 540p scaled up]
::  89 KB -quality 20  [Clearly blurry trees with detail left in sensible places]
:: 110 KB -quality 30  [Still only subtle blurring and noise]
:: 129 KB -quality 40  [Visible softening, but subtle]
:: 145 KB -quality 50
:: 167 KB -quality 60  [Slight noise in treetop textures and softer shadow edges]
:: 190 KB -quality 70  [Treetop fuzz just becoming visible]
:: 246 KB -quality 80  [Minimal noise at 200% zoom]
:: 303 KB -quality 85
:: 383 KB -quality 90  [Minimal noise, even at 600%]

:: 955 KB PNG original
:: 411 KB PNG pngquant
:: 352 KB PNG tinyPNG
:: 182 KB PNG 540p pngquant
:: 143 KB PNG 540p tinyPNG

:: Summary (lossy WebP):
::  - Q70-80 looks great even zoomed in somewhat.
::  - Q40-50 same file size as 50% scaled PNG and much better quality.
::  - Q10 looks similar to 50% scaled PNG scaled back up.
