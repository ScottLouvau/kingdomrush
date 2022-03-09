@ECHO OFF
SET pngquant=C:\Users\slouv\OneDrive\Tools\bin\Image\pngquant.exe
SET InputFolder=%~1
SET OutputFolder=%~2

IF "%OutputFolder%"=="" (SET OutputFolder=%InputFolder%\..\png)

ECHO.
ECHO Converting "%InputFolder%" to quantized PNG at "%OutputFolder%"...

IF NOT EXIST "%OutputFolder%" (MD "%OutputFolder%")
FOR %%C IN (%InputFolder%\*.*) DO (
    ECHO - %%~nxC
    "%pngquant%" "%%C" --speed 1 --skip-if-larger --o "%OutputFolder%\%%~nxC"
)
