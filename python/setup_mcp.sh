#!/bin/bash
# Setup script for the PhonoPaint MCP server.
# Creates a virtual environment, installs dependencies, and tests the server.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "🎨 Setting up PhonoPaint MCP server..."
echo ""

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install
echo "📥 Installing dependencies..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet mcp pronouncing

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the MCP server:"
echo "  $VENV_DIR/bin/python $SCRIPT_DIR/phonopaint_mcp.py"
echo ""
echo "To configure in Claude Desktop, add to your config:"
echo '  {'
echo '    "mcpServers": {'
echo '      "phonopaint": {'
echo "        \"command\": \"$VENV_DIR/bin/python\","
echo "        \"args\": [\"$SCRIPT_DIR/phonopaint_mcp.py\"]"
echo '      }'
echo '    }'
echo '  }'
echo ""
echo "To test interactively:"
echo "  $VENV_DIR/bin/python -c 'from phonopaint_mcp import mcp; print(\"MCP server ready!\")'"
