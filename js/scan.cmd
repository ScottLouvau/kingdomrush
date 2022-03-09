@ECHO OFF
SET Plan=%~1
SET PlanDir=%~dp1
SET PlanName=%~n1

IF "%Plan%"=="" (
    SET Plan=../data/plans/manual/L22.txt
    SET PlanDir=../data/plans/manual/
    SET PlanName=L22
)

SET PlanFilePath=%~dp1..\Plans\%~n1.txt
PUSHD "%~dp0node"
node scan.js video "%~1" "%PlanFilePath%" 

CALL "%~dp0animate.cmd" "%PlanFilePath%"