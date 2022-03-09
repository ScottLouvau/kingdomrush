@ECHO OFF
SET Plan=%~1
SET PlanDir=%~dp1
SET PlanName=%~n1

IF "%Plan%"=="" (
    SET Plan=../data/plans/manual/L22.txt
    SET PlanDir=../data/plans/manual/
    SET PlanName=L22
)

PUSHD "%~dp0node"
node animate.js "%Plan%"
START "" "%PlanDir%animated\%PlanName%.mp4"