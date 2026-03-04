#!/bin/bash
set -e

# build_app.sh - Orchestrate the full build of the Lyrical Phonetics standalone app

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_ROOT"

echo "🎨 Building React frontend (Vite)..."
npm run build

echo "🐍 Building Python backend (PyInstaller)..."
bash build/build_python.sh

echo "📦 Packaging Electron app..."
cd electron
rm -rf dist
cp -R ../dist .
npm install --cache /tmp/npm_cache
npm run build --cache /tmp/npm_cache # Should trigger electron-builder

echo "✨ Standalone DMG built at $PROJECT_ROOT/dist-electron/"
