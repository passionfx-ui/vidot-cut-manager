@echo off
rem comfy-api-proxy (Comfy API v2) on 127.0.0.1:8189 in front of ComfyUI 8188, from the pack's isolated venv.
cd /d "%~dp0"
if not exist ".venv-sdk\Scripts\comfy-api-proxy.exe" (
  echo .venv-sdk missing. Create it: py -3.13 -m venv .venv-sdk ^&^& .venv-sdk\Scripts\python -m pip install comfy-sdk comfy-api-proxy
  pause & exit /b 1
)
".venv-sdk\Scripts\comfy-api-proxy.exe" run --comfyui http://127.0.0.1:8188 --host 127.0.0.1 --port 8189
pause
