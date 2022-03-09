@ECHO OFF
PUSHD "%~dp0"

CALL "%~dp0animate/bundle.cmd"

IF NOT EXIST "../deploy" (MD "../deploy")

ROBOCOPY /NJH /NJS /MIR animate ../deploy/animate /XD out /XF *.cmd
COPY /Y animate\out\bundle.js ..\deploy\animate\index.js

ROBOCOPY /NJH /NJS /MIR maps ../deploy/maps
ROBOCOPY /NJH /NJS /MIR scan ../deploy/scan
ROBOCOPY /NJH /NJS /MIR ref ../deploy/ref

ROBOCOPY /NJH /NJS /MIR common ../deploy/common
ROBOCOPY /NJH /NJS /MIR data ../deploy/data /XD train-sprites
ROBOCOPY /NJH /NJS /MIR img ../deploy/img /XD q50

ROBOCOPY /NJH /NJS /MIR ../deploy /Code/blog/static/KR