#!/bin/bash
set -e

# build_python.sh - Bundle the Python backend into a standalone binary

# Get the absolute path of the project root
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
PYTHON_DIR="$PROJECT_ROOT/python"
BUILD_DIR="$PROJECT_ROOT/build/python-backend"

echo "🔨 Building Python backend..."

# Ensure we are in the python directory
cd "$PYTHON_DIR"

# Get the spacy model path
SPACY_MODEL_PATH=$(python3 -c "import en_core_web_sm; import os; print(os.path.dirname(en_core_web_sm.__file__))")

# Run PyInstaller
# --onefile: produce a single executable
# --name: name of the executable
# --distpath: where to put the final binary
# --add-data: include the spacy model data
# --hidden-import: ensure these are included

python3 -m PyInstaller --onefile --clean \
    --name "ph-backend" \
    --distpath "$BUILD_DIR" \
    --add-data "$SPACY_MODEL_PATH:en_core_web_sm" \
    --hidden-import "flask" \
    --hidden-import "flask_cors" \
    --hidden-import "spacy" \
    --hidden-import "en_core_web_sm" \
    --hidden-import "pronouncing" \
    --hidden-import "cmudict" \
    --hidden-import "nltk" \
    --collect-data "cmudict" \
    --copy-metadata "cmudict" \
    --exclude-module "torch" \
    --exclude-module "torchvision" \
    --exclude-module "torchaudio" \
    --exclude-module "scipy" \
    --exclude-module "pandas" \
    --exclude-module "matplotlib" \
    --exclude-module "pygame" \
    --exclude-module "transformers" \
    --exclude-module "pyarrow" \
    --exclude-module "fitz" \
    --exclude-module "selenium" \
    --exclude-module "cv2" \
    --exclude-module "PIL" \
    --exclude-module "IPython" \
    --exclude-module "notebook" \
    --exclude-module "jedi" \
    --exclude-module "PyQt5" \
    --exclude-module "PySide2" \
    --exclude-module "tkinter" \
    "server.py"

echo "✅ Python backend built at $BUILD_DIR/ph-backend"
