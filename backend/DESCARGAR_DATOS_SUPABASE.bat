@echo off
title Descargador Automatico de Respaldo Supabase - IEG
color 0b
echo ===================================================
echo     DESCARGA AUTOMATICA DE BACKUP Y ARCHIVOS PDF
echo          Institucion Educativa Guaimaral
echo ===================================================
echo.
echo Conectando con Supabase para descargar tablas y PDFs...
echo.

node "%~dp0descargar_backup_supabase.js"

echo.
echo Proceso finalizado. Revisa las carpetas DATOS_JSON y ARCHIVOS_PDF en tu Escritorio.
echo.
pause
