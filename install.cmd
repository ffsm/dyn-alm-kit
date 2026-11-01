@echo off
rem Instala (ou atualiza) o kit dyn-alm nesta maquina. Repasse --update ou --uninstall se quiser.
node "%~dp0install.js" %*
if "%~1"=="" pause
