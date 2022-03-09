@ECHO OFF
PUSHD "%~dp0"

SET out=..\img\png
IF NOT EXIST "%out%\maps" (CALL toOptPng.cmd ..\..\source-data\maps %out%\maps)
IF NOT EXIST "%out%\sprites" (CALL toOptPng.cmd ..\..\source-data\sprites %out%\sprites)
IF NOT EXIST "%out%\maps\labelled" (CALL toOptPng.cmd ..\..\source-data\maps\labelled\maps\labelled %out%\maps\labelled)

:: Q70 [196 KB average] looks good, even at 150%.
:: Q50 [156 KB average] is the lower bound before images start to look worse at 100%.
:: 540p is tiny but even Q30 1080p [117 KB] looks better, so not even for < 200 KB page weight.

SET out=..\img\webp

::SET q=80
::IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q%)
::IF NOT EXIST "%out%\q%q%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q%)

SET q=70
IF NOT EXIST "%out%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\maps %q%)
IF NOT EXIST "%out%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\sprites %q%)
IF NOT EXIST "%out%\maps\labelled" (CALL toWebP.cmd ..\..\source-data\maps\labelled\maps\labelled %out%\maps\labelled %q%)

::SET q=60
::IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q%)
::IF NOT EXIST "%out%\q%q%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q%)

SET q=50
IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q%)
IF NOT EXIST "%out%\q%q%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q%)
::IF NOT EXIST "%out%\q%q%\maps\labelled" (CALL toWebP.cmd ..\..\source-data\maps\labelled\maps\labelled %out%\q%q%\maps\labelled %q%)


::SET q=40
::IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q%)
::IF NOT EXIST "%out%\q%q%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q%)

::SET q=30
::IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q%)
::IF NOT EXIST "%out%\q%q%\sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q%)

::SET out=..\img\webp\540p
::SET q=70
::IF NOT EXIST "%out%\q%q%\maps" (CALL toWebP.cmd ..\..\source-data\maps %out%\q%q%\maps %q% "-scale 50%%%%")
::IF NOT EXIST "%out%\q%q%sprites" (CALL toWebP.cmd ..\..\source-data\sprites %out%\q%q%\sprites %q% "-scale 50%%%%")